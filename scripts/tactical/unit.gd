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

@export var perception: int = 10
@export var stealth: int = 0
@export var vision_range: int = 9

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

# --------- STATUS ---------
var statuses: Array[Dictionary] = []

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


func add_status(name: String, turns: int, params := {}, stacks := 1) -> void:
	if turns <= 0:
		return
	var existing: Dictionary = {}
	for s in statuses:
		if String(s.get("name", "")) == name:
			existing = s
			break

	if not existing.is_empty():
		existing["turns"] = max(int(existing.get("turns", 0)), turns)
		existing["stacks"] = max(1, int(existing.get("stacks", 1)) + max(1, stacks))
		if params != null and not params.is_empty():
			var merged = existing.get("params", {}).duplicate(true)
			for k in params.keys():
				merged[k] = params[k]
			existing["params"] = merged
	else:
		statuses.append({
			"name": name,
			"turns": turns,
			"params": params if params != null else {},
			"stacks": max(1, stacks)
		})
	print("%s ganhou status %s (%dT)" % [unit_name, name, turns])
	_apply_status_modifiers()


func has_status(name: String) -> bool:
	for s in statuses:
		if String(s.get("name", "")) == name:
			return true
	return false


func get_status(name: String) -> Dictionary:
	for s in statuses:
		if String(s.get("name", "")) == name:
			return s
	return {}


func remove_status(name: String) -> void:
	statuses = statuses.filter(func(s): return String(s.get("name", "")) != name)
	_apply_status_modifiers()


func tick_statuses_turn_start() -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var remaining: Array[Dictionary] = []
	for s in statuses:
		var name = String(s.get("name", ""))
		var turns = int(s.get("turns", 0))
		var stacks = max(1, int(s.get("stacks", 1)))
		var params: Dictionary = s.get("params", {})
		if name == "Stun":
			events.append({"type": "stun", "name": name, "stacks": stacks})
			turns -= 1
		elif name == "Bleed":
			var dot = int(params.get("dot", 2)) * stacks
			events.append({
				"type": "damage",
				"name": name,
				"amount": max(1, dot),
				"dmg_type": Damage.DmgType.PIERCING,
				"true_damage": true
			})
			turns -= 1
		elif name == "Burn":
			var burn_dot = int(params.get("dot", 3)) * stacks
			events.append({
				"type": "damage",
				"name": name,
				"amount": max(1, burn_dot),
				"dmg_type": Damage.DmgType.MELTING,
				"armor_mult": 0.5
			})
			turns -= 1
		else:
			turns -= 1

		if turns > 0:
			s["turns"] = turns
			remaining.append(s)
	statuses = remaining
	_apply_status_modifiers()
	return events


func tick_statuses_turn_end() -> Array[Dictionary]:
	_apply_status_modifiers()
	return []


func get_status_summary() -> String:
	if statuses.is_empty():
		return ""
	var parts: Array[String] = []
	for s in statuses:
		parts.append("%s(%d)" % [String(s.get("name", "")), int(s.get("turns", 0))])
	return ", ".join(parts)


func get_move_penalty() -> int:
	var penalty = 0
	for s in statuses:
		var name = String(s.get("name", ""))
		var stacks = max(1, int(s.get("stacks", 1)))
		var params: Dictionary = s.get("params", {})
		if name == "Slow":
			penalty += int(params.get("move_penalty", 1)) * stacks
		elif name == "Haste":
			penalty -= int(params.get("move_bonus", 1)) * stacks
	return max(0, penalty)


func get_aim_penalty() -> int:
	var penalty = 0
	for s in statuses:
		var name = String(s.get("name", ""))
		var stacks = max(1, int(s.get("stacks", 1)))
		var params: Dictionary = s.get("params", {})
		if name == "Slow":
			penalty += int(params.get("aim_penalty", 10)) * stacks
		elif name == "Haste":
			penalty -= int(params.get("aim_bonus", 5)) * stacks
	return max(0, penalty)


func get_def_bonus_from_status() -> int:
	var bonus = 0
	for s in statuses:
		var name = String(s.get("name", ""))
		var stacks = max(1, int(s.get("stacks", 1)))
		var params: Dictionary = s.get("params", {})
		if name == "Haste":
			bonus += int(params.get("def_bonus", 0)) * stacks
		elif name == "Slow":
			bonus -= int(params.get("def_penalty", 0)) * stacks
	return bonus


func _apply_status_modifiers() -> void:
	var haste_bonus = 0
	var slow_penalty = 0
	for s in statuses:
		var name = String(s.get("name", ""))
		var stacks = max(1, int(s.get("stacks", 1)))
		var params: Dictionary = s.get("params", {})
		if name == "Haste":
			haste_bonus += int(params.get("pa_bonus", 1)) * stacks
		elif name == "Slow":
			slow_penalty += int(params.get("pa_penalty", 1)) * stacks
	pa_max = max(1, base_pa_max + haste_bonus - slow_penalty)
	pa = min(pa, pa_max)


func tick_cooldowns() -> void:
	for k in cooldowns.keys():
		cooldowns[k] = max(0, int(cooldowns[k]) - 1)


func cd_left(ability_name: String) -> int:
	return int(cooldowns.get(ability_name, 0))


func set_cd(ability_name: String, cd: int) -> void:
	cooldowns[ability_name] = max(0, cd)
