extends Node3D
class_name Unit
const Damage := preload("res://scripts/tactical/damage.gd")

@export var unit_name: String = "Unit"
@export var team: int = 0
@export var role: String = ""
@export var tags: Array[String] = []

@export var dex: int = 10
@export var agi: int = 10
@export var def: int = 10
@export var speed: int = 10

@export var will: int = 10
@export var vit: int = 10

@export var perception: int = 10
@export var stealth: int = 0
@export var vision_range: int = 9
@export var jump: int = 1

@export var pa_max: int = 8
var pa: int = 8
var base_pa_max: int = 8

@export var base_max_hp: int = 20
var max_hp: int = 20
var hp: int = 20

var cell: Vector2i = Vector2i.ZERO

var overwatch: bool = false
var overwatch_used: bool = false
var dead: bool = false
var facing_dir: Vector2i = Vector2i(0, 1)
var oa_used_this_turn: bool = false

# --------- STATUS ---------
var statuses: Dictionary = {} # id -> {id,duration_turns,stacks,potency,flags,source_id}
var resist: Dictionary = {
	"STUN": 0.0,
	"BLEED": 0.0,
	"WARD": 0.0,
	"SLOW": 0.0,
	"REGEN": 0.0
}

# --------- INVENTÁRIO / EQUIP ---------
var inventory: Array[Dictionary] = []
var equipped: Dictionary = {
	"weapon": null,
	"armor": null,
	"accessory": null
}

# --------- HABILIDADES ---------
var abilities: Array[Dictionary] = []
var cooldowns: Dictionary = {} # name -> turns remaining

# casting state (cast_time > 0)
var casting: bool = false
var casting_ability: Dictionary = {}
var casting_target_cell: Vector2i = Vector2i(-999, -999)
var casting_target_unit_id: int = 0


func _ready() -> void:
	_recalc_derived()
	base_pa_max = pa_max
	pa = pa_max
	hp = max_hp
	dead = false


func _recalc_derived() -> void:
	# max_hp base + accessory
	var acc = equipped["accessory"]
	var hp_bonus = 0
	var v_bonus = 0
	var st_bonus = 0
	if acc != null:
		hp_bonus = int(acc.get("hp_bonus", 0))
		v_bonus = int(acc.get("vision_bonus", 0))
		st_bonus = int(acc.get("stealth_bonus", 0))

	max_hp = base_max_hp + hp_bonus
	vision_range = max(3, vision_range + v_bonus)
	stealth = max(0, stealth + st_bonus)
	hp = clamp(hp, 0, max_hp)


func equip(item: Dictionary) -> void:
	if item == null:
		return
	var slot = int(item.get("slot", -1))
	if slot == Gear.Slot.WEAPON:
		equipped["weapon"] = item
	elif slot == Gear.Slot.ARMOR:
		equipped["armor"] = item
	elif slot == Gear.Slot.ACCESSORY:
		equipped["accessory"] = item
	_recalc_derived()


func get_weapon_dmg() -> int:
	var w = equipped["weapon"]
	return int(w.get("dmg", 0)) if w != null else 0

func get_weapon_aim_bonus() -> int:
	var w = equipped["weapon"]
	return int(w.get("aim_bonus", 0)) if w != null else 0

func get_weapon_range_bonus() -> float:
	var w = equipped["weapon"]
	return float(w.get("range_bonus", 0.0)) if w != null else 0.0

func get_melee_dmg_bonus() -> int:
	var w = equipped["weapon"]
	return int(w.get("melee_dmg_bonus", 0)) if w != null else 0

func get_melee_aim_bonus() -> int:
	var w = equipped["weapon"]
	return int(w.get("melee_aim_bonus", 0)) if w != null else 0

func get_melee_range_bonus() -> int:
	var w = equipped["weapon"]
	return int(w.get("melee_range_bonus", 0)) if w != null else 0

func get_jump() -> int:
	return max(0, jump)

func get_armor_value() -> int:
	var a = equipped["armor"]
	return int(a.get("armor", 0)) if a != null else 0

func get_def_bonus() -> int:
	var a = equipped["armor"]
	return int(a.get("def_bonus", 0)) if a != null else 0


func spend_pa(cost: int) -> bool:
	if cost <= 0:
		return true
	if pa < cost:
		return false
	pa -= cost
	return true


func apply_damage(dmg: int) -> int:
	if dead:
		return 0
	var applied = max(0, dmg)
	hp = max(0, hp - applied)
	if hp <= 0:
		dead = true
	return applied


func apply_heal(amount: int) -> int:
	if dead:
		return 0
	var applied = max(0, amount)
	hp = clamp(hp + applied, 0, max_hp)
	return applied


func add_status(id: String, duration: int, potency := 0.0, stacks := 1, flags := {}, source_id := 0) -> void:
	if duration <= 0 or id == "":
		return
	var status_id = id.to_upper()
	var existing: Dictionary = statuses.get(status_id, {})
	var next_flags = flags if flags != null else {}
	if not existing.is_empty():
		var next_duration = max(int(existing.get("duration_turns", 0)), duration)
		var next_stacks = max(1, int(existing.get("stacks", 1)))
		var next_potency = float(existing.get("potency", 0.0))
		if status_id in ["BLEED", "REGEN"]:
			next_stacks += max(1, stacks)
			next_potency += float(potency)
		else:
			next_stacks = 1
			next_potency = max(next_potency, float(potency))
		var merged_flags = existing.get("flags", {}).duplicate(true)
		for k in next_flags.keys():
			merged_flags[k] = next_flags[k]
		statuses[status_id] = {
			"id": status_id,
			"duration_turns": next_duration,
			"stacks": next_stacks,
			"potency": next_potency,
			"flags": merged_flags,
			"source_id": int(existing.get("source_id", source_id))
		}
	else:
		statuses[status_id] = {
			"id": status_id,
			"duration_turns": duration,
			"stacks": max(1, stacks),
			"potency": float(potency),
			"flags": next_flags,
			"source_id": int(source_id)
		}
	print("%s ganhou status %s (%dT)" % [unit_name, status_id, duration])
	_apply_status_modifiers()


func has_status(id: String) -> bool:
	return statuses.has(id.to_upper())


func get_status(id: String) -> Dictionary:
	return statuses.get(id.to_upper(), {})


func remove_status(id: String) -> void:
	statuses.erase(id.to_upper())
	_apply_status_modifiers()


func tick_statuses_turn_start() -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	oa_used_this_turn = false
	var to_remove: Array[String] = []
	for key in statuses.keys():
		var s: Dictionary = statuses[key]
		var status_id = String(s.get("id", key))
		var turns = int(s.get("duration_turns", 0))
		var stacks = max(1, int(s.get("stacks", 1)))
		var potency = float(s.get("potency", 0.0))
		if status_id == "STUN":
			events.append({"type": "stun", "name": status_id, "stacks": stacks})
		elif status_id == "BLEED":
			var dot = max(1, int(round(potency)))
			events.append({
				"type": "damage",
				"name": status_id,
				"amount": dot,
				"dmg_type": Damage.DmgType.PIERCING,
				"true_damage": false
			})
		elif status_id == "REGEN":
			var hot = max(1, int(round(potency)))
			events.append({"type": "heal", "name": status_id, "amount": hot})

		turns -= 1
		if turns <= 0:
			to_remove.append(status_id)
		else:
			s["duration_turns"] = turns
			statuses[status_id] = s

	for status_id in to_remove:
		statuses.erase(status_id)
	_apply_status_modifiers()
	return events


func tick_statuses_turn_end() -> Array[Dictionary]:
	_apply_status_modifiers()
	return []

func is_stunned() -> bool:
	return has_status("STUN")

func get_move_multiplier() -> float:
	var mult := 1.0
	if has_status("SLOW"):
		var s := get_status("SLOW")
		var potency = float(s.get("potency", 0.0))
		mult *= clamp(1.0 - potency, 0.2, 1.0)
	return mult

func get_damage_taken_multiplier(_dmg_type: int) -> float:
	var mult := 1.0
	if has_status("WARD"):
		var s := get_status("WARD")
		var potency = clamp(float(s.get("potency", 0.0)), 0.0, 0.9)
		mult *= max(0.1, 1.0 - potency)
	var resist_bonus = clamp(float(resist.get("WARD", 0.0)), 0.0, 0.8)
	if resist_bonus > 0.0:
		mult *= max(0.1, 1.0 - resist_bonus)
	return mult

func status_save_check(status_id: String, source_power: int) -> bool:
	var id = status_id.to_upper()
	var resist_bonus = clamp(float(resist.get(id, 0.0)), 0.0, 0.8)
	var def_stat = will
	if id == "BLEED":
		def_stat = vit
	elif id == "STUN":
		def_stat = will
	var chance_resist = clamp(0.15 + (float(def_stat - source_power) * 0.03) + resist_bonus, 0.05, 0.85)
	var roll = randi_range(1, 100)
	return roll <= int(round(chance_resist * 100.0))

func compute_applied_duration(status_id: String, base_duration: int) -> int:
	var id = status_id.to_upper()
	var resist_bonus = clamp(float(resist.get(id, 0.0)), 0.0, 0.8)
	var reduction = int(floor(resist_bonus / 0.3))
	return max(1, base_duration - reduction)

func compute_applied_potency(status_id: String, base_potency: float) -> float:
	var id = status_id.to_upper()
	var resist_bonus = clamp(float(resist.get(id, 0.0)), 0.0, 0.8)
	return max(0.0, base_potency * (1.0 - resist_bonus))


func get_status_summary() -> String:
	if statuses.is_empty():
		return ""
	var parts: Array[String] = []
	var keys = statuses.keys()
	keys.sort()
	for k in keys:
		var s = statuses[k]
		var id = String(s.get("id", k))
		var turns = int(s.get("duration_turns", 0))
		var stacks = int(s.get("stacks", 1))
		var potency = float(s.get("potency", 0.0))
		if id in ["BLEED", "REGEN"]:
			parts.append("%s(%dt|p:%.1f)" % [id, turns, potency])
		elif id == "WARD":
			parts.append("%s(%d|%d%%)" % [id, turns, int(round(potency * 100.0))])
		elif id == "SLOW":
			parts.append("%s(%d|%d%%)" % [id, turns, int(round(potency * 100.0))])
		else:
			parts.append("%s(%d)" % [id, turns])
	return ", ".join(parts)


func get_aim_penalty() -> int:
	var penalty = 0
	for s in statuses.values():
		var stacks = max(1, int(s.get("stacks", 1)))
		var flags: Dictionary = s.get("flags", {})
		if flags.has("aim_penalty"):
			penalty += int(flags.get("aim_penalty", 0)) * stacks
		if flags.has("aim_bonus"):
			penalty -= int(flags.get("aim_bonus", 0)) * stacks
	return max(0, penalty)


func get_def_bonus_from_status() -> int:
	var bonus = 0
	for s in statuses.values():
		var stacks = max(1, int(s.get("stacks", 1)))
		var flags: Dictionary = s.get("flags", {})
		if flags.has("def_bonus"):
			bonus += int(flags.get("def_bonus", 0)) * stacks
		if flags.has("def_penalty"):
			bonus -= int(flags.get("def_penalty", 0)) * stacks
	return bonus


func _apply_status_modifiers() -> void:
	var pa_bonus = 0
	var pa_penalty = 0
	for s in statuses.values():
		var stacks = max(1, int(s.get("stacks", 1)))
		var flags: Dictionary = s.get("flags", {})
		if flags.has("pa_bonus"):
			pa_bonus += int(flags.get("pa_bonus", 0)) * stacks
		if flags.has("pa_penalty"):
			pa_penalty += int(flags.get("pa_penalty", 0)) * stacks
	pa_max = max(1, base_pa_max + pa_bonus - pa_penalty)
	pa = min(pa, pa_max)


func tick_cooldowns() -> void:
	for k in cooldowns.keys():
		cooldowns[k] = max(0, int(cooldowns[k]) - 1)


func cd_left(ability_name: String) -> int:
	return int(cooldowns.get(ability_name, 0))


func set_cd(ability_name: String, cd: int) -> void:
	cooldowns[ability_name] = max(0, cd)
