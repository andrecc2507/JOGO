extends Node3D
class_name Unit
const DamageRef := preload("res://scripts/tactical/damage.gd")
const RPGProgressionRef := preload("res://scripts/rpg/progression.gd")
const RPGStatsRef := preload("res://scripts/rpg/stats.gd")
const RPGClassesRef := preload("res://scripts/rpg/classes_db.gd")
const AbilitiesRef := preload("res://scripts/tactical/abilities.gd")

@export var unit_name: String = "Unit"
@export var team: int = 0
@export var role: String = ""
@export var tags: Array[String] = []
@export var hero_id: String = ""

@export var rpg_class_id: String = ""
@export var level: int = 1
@export var xp: int = 0
@export var stat_points: int = 0
@export var skill_points: int = 0

@export var stat_str: int = 10
@export var stat_dex: int = 10
@export var stat_agi: int = 10
@export var stat_vit: int = 10
@export var stat_int: int = 10

@export var dex: int = 10
@export var agi: int = 10
@export var def: int = 10
@export var speed: int = 10
var base_dex: int = 10
var base_agi: int = 10
var base_def: int = 10
var base_speed: int = 10

@export var will: int = 10
@export var vit: int = 10

@export var perception: int = 10
@export var stealth: int = 0
@export var vis_range: int = 10
@export var vision_range: int = 9
var base_perception: int = 10
var base_vision_range: int = 9
@export var jump: int = 1

@export var pa_max: int = 8
var pa: int = 8
var base_pa_max: int = 8

@export var base_max_hp: int = 20
@export var base_hp: int = 20
var max_hp: int = 20
var hp: int = 20
@export var mp_max: int = 6
@export var base_mp: int = 6
var mp: int = 6
var base_mp_max: int = 6

var base_stats: Dictionary = {"STR": 10, "DEX": 10, "AGI": 10, "VIT": 10, "INT": 10}
var unlocked_skills: Dictionary = {}

var cell: Vector2i = Vector2i.ZERO
var visible_to_player: bool = true
var last_seen_cell: Vector2i = Vector2i(-999, -999)
var last_seen_time: float = -1.0

var overwatch: bool = false
var overwatch_used: bool = false
var dead: bool = false
var facing_dir: Vector3 = Vector3.FORWARD
var facing_yaw: float = 0.0
var oa_used_this_turn: bool = false
var took_damage_since_last_turn: bool = false
var channeling: bool = false
var channel_ability: Dictionary = {}

var ai_profile: Dictionary = {}

# --------- HIT ZONES ---------
var hit_zones: Array[Dictionary] = []

# --------- STATUS ---------
const STATUS_DEFS := {
	"STUN": {"stack": "refresh", "tick": "start"},
	"ROOT": {"stack": "refresh", "tick": "start"},
	"SLOW": {"stack": "refresh", "tick": "start"},
	"BLEED": {"stack": "stack", "tick": "start"},
	"BURN": {"stack": "stack", "tick": "end"},
	"VULNERABLE": {"stack": "refresh", "tick": "start"},
	"REGEN": {"stack": "stack", "tick": "start"},
	"WARD": {"stack": "refresh", "tick": "start"},
	"CRIPPLE": {"stack": "refresh", "tick": "start"},
	"WEAKEN": {"stack": "refresh", "tick": "start"},
	"BLIND": {"stack": "refresh", "tick": "start"},
	"HUNKER": {"stack": "refresh", "tick": "start"}
}

var statuses: Dictionary = {} # id -> {id,duration_turns,stacks,potency,flags,source_id}
var resist: Dictionary = {
	"STUN": 0.0,
	"ROOT": 0.0,
	"BLEED": 0.0,
	"BURN": 0.0,
	"SLOW": 0.0,
	"VULNERABLE": 0.0,
	"WARD": 0.0,
	"REGEN": 0.0,
	"PIERCING": 0.0,
	"EXPLOSIVE": 0.0,
	"MELTING": 0.0,
	"CRIPPLE": 0.0,
	"WEAKEN": 0.0,
	"BLIND": 0.0
}

# --------- INVENTÁRIO / EQUIP ---------
var inventory: Array[Dictionary] = []
var equipped: Dictionary = {
	"weapon": null,
	"armor": null,
	"amulet_1": null,
	"amulet_2": null,
	"charm": null,
	"trinket": null,
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
	_sync_base_stats()
	base_pa_max = pa_max
	base_mp_max = mp_max
	_ensure_rpg_points()
	_recalc_derived()
	pa = pa_max
	hp = max_hp
	mp = mp_max
	dead = false
	if hit_zones.is_empty():
		init_default_hit_zones()

func _sync_base_stats() -> void:
	base_stats = {
		"STR": stat_str,
		"DEX": stat_dex,
		"AGI": stat_agi,
		"VIT": stat_vit,
		"INT": stat_int
	}
	base_dex = dex
	base_agi = agi
	base_def = def
	base_speed = speed
	base_perception = perception
	base_vision_range = vision_range
	if base_hp <= 0:
		base_hp = base_max_hp
	if base_mp <= 0:
		base_mp = base_mp_max

func _ensure_rpg_points() -> void:
	var expected_sp = RPGProgressionRef.total_skill_points(level)
	var expected_stat = RPGProgressionRef.total_stat_points(level)
	if skill_points == 0:
		skill_points = expected_sp
	if stat_points == 0:
		stat_points = expected_stat

func init_default_hit_zones() -> void:
	hit_zones = [
		{
			"id": "HEAD",
			"label": "Cabeça",
			"to_hit_mod": -20,
			"dmg_mult": 1.25,
			"status_on_hit": "BLIND",
			"status_chance": 0.25,
			"enabled": true
		},
		{
			"id": "TORSO",
			"label": "Tronco",
			"to_hit_mod": 0,
			"dmg_mult": 1.0,
			"status_on_hit": "",
			"status_chance": 0.0,
			"enabled": true
		},
		{
			"id": "ARMS",
			"label": "Braços",
			"to_hit_mod": -10,
			"dmg_mult": 0.9,
			"status_on_hit": "WEAKEN",
			"status_chance": 0.2,
			"enabled": true
		},
		{
			"id": "LEGS",
			"label": "Pernas",
			"to_hit_mod": -15,
			"dmg_mult": 0.95,
			"status_on_hit": "CRIPPLE",
			"status_chance": 0.25,
			"enabled": true
		}
	]

func get_hit_zone(zone_id: String) -> Dictionary:
	var zid = zone_id.to_upper()
	for zone in hit_zones:
		if String(zone.get("id", "")).to_upper() == zid:
			return zone
	return {}

func set_hit_zone(zone_id: String, data: Dictionary) -> void:
	var zid = zone_id.to_upper()
	for i in range(hit_zones.size()):
		var zone = hit_zones[i]
		if String(zone.get("id", "")).to_upper() == zid:
			hit_zones[i] = data
			return

func get_enabled_hit_zones() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for zone in hit_zones:
		if bool(zone.get("enabled", true)):
			out.append(zone)
	return out

func get_default_hit_zone() -> Dictionary:
	var torso = get_hit_zone("TORSO")
	if not torso.is_empty() and bool(torso.get("enabled", true)):
		return torso
	var enabled = get_enabled_hit_zones()
	return enabled[0] if not enabled.is_empty() else {}

func set_visible_state(is_visible: bool) -> void:
	var tint := Color(1, 1, 1, 1.0) if is_visible else Color(1, 1, 1, 0.2)
	for child in get_children():
		if child is VisualInstance3D:
			child.visible = is_visible
		if child is Sprite3D:
			child.modulate = tint

func mark_seen(seen_cell: Vector2i, t: float) -> void:
	last_seen_cell = seen_cell
	last_seen_time = t

func set_facing_towards(world_point: Vector3) -> void:
	var dir := world_point - global_position
	dir.y = 0.0
	if dir.length() <= 0.001:
		return
	facing_dir = dir.normalized()
	facing_yaw = atan2(facing_dir.x, facing_dir.z)
	rotation.y = facing_yaw

func _recalc_derived() -> void:
	var mods := _collect_mods()
	var rpg = RPGStatsRef.compute_final_stats(self)
	var final_stats: Dictionary = rpg.get("stats", {})
	stat_str = int(final_stats.get("STR", stat_str))
	stat_dex = int(final_stats.get("DEX", stat_dex))
	stat_agi = int(final_stats.get("AGI", stat_agi))
	stat_vit = int(final_stats.get("VIT", stat_vit))
	stat_int = int(final_stats.get("INT", stat_int))
	dex = stat_dex
	agi = stat_agi
	vit = stat_vit
	def = base_def + int(mods.get("def_bonus", 0))
	speed = base_speed + int(mods.get("speed_bonus", 0))
	perception = base_perception + int(mods.get("perception_bonus", 0))
	var hp_bonus = int(mods.get("hp_bonus", 0))
	var pa_bonus = int(mods.get("pa_bonus", 0))
	var mp_bonus = int(mods.get("mp_bonus", 0))
	var rpg_hp = int(rpg.get("hp", base_max_hp))
	var rpg_mp = int(rpg.get("mp", base_mp_max))
	max_hp = rpg_hp + hp_bonus
	pa_max = base_pa_max + pa_bonus
	mp_max = rpg_mp + mp_bonus
	var base_vis = max(3, base_vision_range)
	var final_vis = base_vis + int(mods.get("vision_bonus", 0))
	vis_range = final_vis
	vision_range = final_vis
	hp = clamp(hp, 0, max_hp)
	pa = clamp(pa, 0, pa_max)
	mp = clamp(mp, 0, mp_max)


func equip(item: Dictionary) -> void:
	if item == null:
		return
	var slot = String(item.get("slot", ""))
	if slot == "weapon":
		equipped["weapon"] = item
	elif slot == "armor":
		equipped["armor"] = item
	elif slot == "amulet":
		if equipped["amulet_1"] == null:
			equipped["amulet_1"] = item
		elif equipped["amulet_2"] == null:
			equipped["amulet_2"] = item
		else:
			equipped["amulet_1"] = item
	elif slot in ["amulet_1", "amulet_2"]:
		equipped[slot] = item
	elif slot in ["charm", "trinket", "accessory"]:
		equipped["charm"] = item
		equipped["trinket"] = item
		equipped["accessory"] = item
	var item_abilities: Array = item.get("abilities", [])
	for ability_id in item_abilities:
		var ability = AbilitiesRef.ability_by_id(String(ability_id))
		if ability.is_empty():
			continue
		var exists = false
		for a in abilities:
			if String(a.get("name", "")) == String(ability.get("name", "")):
				exists = true
				break
		if not exists:
			abilities.append(ability)
	_recalc_derived()

func _collect_mods() -> Dictionary:
	var totals := {
		"str_bonus": 0,
		"dex_bonus": 0,
		"agi_bonus": 0,
		"vit_bonus": 0,
		"int_bonus": 0,
		"def_bonus": 0,
		"speed_bonus": 0,
		"perception_bonus": 0,
		"hp_bonus": 0,
		"pa_bonus": 0,
		"mp_bonus": 0,
		"vision_bonus": 0
	}
	for slot in get_equipment_slots():
		var item = equipped.get(slot, null)
		if item == null:
			continue
		var mods: Dictionary = item.get("mods", item)
		for key in totals.keys():
			totals[key] = int(totals[key]) + int(mods.get(key, 0))
	return totals

func _get_item_mod(slot: String, key: String) -> float:
	var item = equipped.get(slot, null)
	if item == null:
		return 0.0
	var mods: Dictionary = item.get("mods", item)
	if mods.has(key):
		return float(mods.get(key, 0))
	if item.has(key):
		return float(item.get(key, 0))
	return float(item.get(key, 0))

func get_weapon_base_atk() -> int:
	var item = equipped.get("weapon", null)
	if item == null:
		return 0
	var weapon_base: Dictionary = item.get("weapon_base", {})
	return int(weapon_base.get("atk_base", 0))

func get_weapon_dmg() -> int:
	var base = get_weapon_base_atk()
	if base > 0:
		return base
	return int(_get_item_mod("weapon", "dmg_bonus"))

func get_weapon_aim_bonus() -> int:
	var item = equipped.get("weapon", null)
	if item != null:
		var weapon_base: Dictionary = item.get("weapon_base", {})
		if weapon_base.has("aim_bonus"):
			return int(weapon_base.get("aim_bonus", 0))
	return int(_get_item_mod("weapon", "aim_bonus"))

func get_weapon_range_bonus() -> float:
	var item = equipped.get("weapon", null)
	if item != null:
		var weapon_base: Dictionary = item.get("weapon_base", {})
		if weapon_base.has("range_bonus"):
			return float(weapon_base.get("range_bonus", 0))
	return float(_get_item_mod("weapon", "range_bonus"))

func get_melee_dmg_bonus() -> int:
	return int(_get_item_mod("weapon", "melee_dmg_bonus"))

func get_melee_aim_bonus() -> int:
	return int(_get_item_mod("weapon", "melee_aim_bonus"))

func get_melee_range_bonus() -> int:
	return int(_get_item_mod("weapon", "melee_range_bonus"))

func get_jump() -> int:
	return max(0, jump)

func get_vis_range() -> int:
	if vis_range > 0:
		return vis_range
	return max(1, vision_range)

func get_armor_value() -> int:
	var armor_bonus = int(_get_item_mod("armor", "armor_bonus"))
	if armor_bonus == 0:
		armor_bonus = int(_get_item_mod("armor", "armor"))
	if armor_bonus == 0:
		var armor_item = equipped.get("armor", null)
		if armor_item != null:
			armor_bonus = int(armor_item.get("armor_value", 0))
	return armor_bonus

func get_def_bonus() -> int:
	var a = equipped["armor"]
	return int(a.get("def_bonus", 0)) if a != null else 0

func get_equipment_slots() -> Array[String]:
	return ["weapon", "armor", "amulet_1", "amulet_2", "charm", "trinket", "accessory"]

func get_stat(stat_id: String) -> int:
	var key = stat_id.to_upper()
	match key:
		"STR":
			return stat_str
		"DEX":
			return stat_dex
		"AGI":
			return stat_agi
		"VIT":
			return stat_vit
		"INT":
			return stat_int
	return 0

func apply_class(class_id: String) -> void:
	var db = RPGClassesRef.new()
	var cls: Dictionary = db.get_class_data(class_id)
	if cls.is_empty():
		return
	rpg_class_id = class_id
	base_stats = cls.get("base_stats", base_stats).duplicate(true)
	base_hp = int(cls.get("base_hp", base_hp))
	base_mp = int(cls.get("base_mp", base_mp))
	stat_str = int(base_stats.get("STR", stat_str))
	stat_dex = int(base_stats.get("DEX", stat_dex))
	stat_agi = int(base_stats.get("AGI", stat_agi))
	stat_vit = int(base_stats.get("VIT", stat_vit))
	stat_int = int(base_stats.get("INT", stat_int))
	unlocked_skills = {}
	for skill_id in cls.get("starting_skills", []):
		unlocked_skills[skill_id] = true
	_ensure_rpg_points()
	_recalc_derived()

func unlock_skill(skill_id: String) -> bool:
	var db = RPGClassesRef.new()
	var skill: Dictionary = db.get_skill_data(skill_id)
	if skill.is_empty():
		return false
	var prereqs: Array = skill.get("prereqs", [])
	for prereq in prereqs:
		if not bool(unlocked_skills.get(prereq, false)):
			return false
	var cost = int(skill.get("cost", 1))
	if skill_points < cost:
		return false
	skill_points -= cost
	unlocked_skills[skill_id] = true
	var effects: Dictionary = skill.get("effects", {})
	var abilities_to_unlock: Array = effects.get("abilities", [])
	for ability_id in abilities_to_unlock:
		var ability = AbilitiesRef.ability_by_id(String(ability_id))
		if ability.is_empty():
			continue
		var exists = false
		for a in abilities:
			if String(a.get("name", "")) == String(ability.get("name", "")):
				exists = true
				break
		if not exists:
			abilities.append(ability)
	_recalc_derived()
	return true


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
	if applied > 0:
		took_damage_since_last_turn = true
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
	var rules: Dictionary = STATUS_DEFS.get(status_id, {"stack": "refresh", "tick": "start"})
	var stack_mode = String(rules.get("stack", "refresh"))
	var existing: Dictionary = statuses.get(status_id, {})
	var next_flags = flags if flags != null else {}
	if not existing.is_empty():
		var next_duration = max(int(existing.get("duration_turns", 0)), duration)
		var next_stacks = max(1, int(existing.get("stacks", 1)))
		var next_potency = float(existing.get("potency", 0.0))
		if stack_mode == "stack":
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
	_apply_status_modifiers()

func apply_status(id: String, turns: int, magnitude: float = 1.0) -> void:
	# Reaplicação segue regras de STATUS_DEFS (refresh ou stack).
	var status_id = id.to_upper()
	if status_id == "":
		return
	match status_id:
		"BLEED":
			add_status(status_id, turns, magnitude, 1, {}, 0)
		"CRIPPLE":
			add_status(status_id, turns, magnitude, 1, {}, 0)
		"WEAKEN":
			add_status(status_id, turns, magnitude, 1, {}, 0)
		"BLIND":
			add_status(status_id, turns, magnitude, 1, {}, 0)
		"STUN":
			add_status(status_id, turns, magnitude, 1, {}, 0)
		_:
			add_status(status_id, turns, magnitude, 1, {}, 0)


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
		var _stacks = max(1, int(s.get("stacks", 1)))
		var potency = float(s.get("potency", 0.0))
		var rules: Dictionary = STATUS_DEFS.get(status_id, {"stack": "refresh", "tick": "start"})
		var tick_timing = String(rules.get("tick", "start"))
		if tick_timing == "start":
			if status_id == "STUN":
				events.append({"type": "stun", "name": status_id, "stacks": _stacks})
			elif status_id == "BLEED":
				var dot = max(1, int(round(potency)))
				events.append({
					"type": "damage",
					"name": status_id,
					"amount": dot,
					"dmg_type": DamageRef.DmgType.PIERCING,
					"true_damage": false
				})
			elif status_id == "REGEN":
				var hot = max(1, int(round(potency)))
				events.append({"type": "heal", "name": status_id, "amount": hot})
			elif status_id == "VULNERABLE":
				events.append({"type": "vulnerable", "name": status_id, "stacks": _stacks})

			turns -= 1
			if turns <= 0:
				to_remove.append(status_id)
				events.append({"type": "expire", "name": status_id})
			else:
				s["duration_turns"] = turns
				statuses[status_id] = s
		else:
			statuses[status_id] = s

	for status_id in to_remove:
		statuses.erase(status_id)
	_apply_status_modifiers()
	return events

func tick_statuses_on_turn_start() -> Array[Dictionary]:
	return tick_statuses_turn_start()


func tick_statuses_turn_end() -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var to_remove: Array[String] = []
	for key in statuses.keys():
		var s: Dictionary = statuses[key]
		var status_id = String(s.get("id", key))
		var turns = int(s.get("duration_turns", 0))
		var _stacks = max(1, int(s.get("stacks", 1)))
		var potency = float(s.get("potency", 0.0))
		var rules: Dictionary = STATUS_DEFS.get(status_id, {"stack": "refresh", "tick": "start"})
		var tick_timing = String(rules.get("tick", "start"))
		if tick_timing != "end":
			continue
		if status_id == "BURN":
			var dot = max(1, int(round(potency)))
			events.append({
				"type": "damage",
				"name": status_id,
				"amount": dot,
				"dmg_type": DamageRef.DmgType.MELTING,
				"true_damage": false
			})
		turns -= 1
		if turns <= 0:
			to_remove.append(status_id)
			events.append({"type": "expire", "name": status_id})
		else:
			s["duration_turns"] = turns
			statuses[status_id] = s
	for status_id in to_remove:
		statuses.erase(status_id)
	_apply_status_modifiers()
	return events

func tick_statuses_on_turn_end() -> Array[Dictionary]:
	return tick_statuses_turn_end()

func is_stunned() -> bool:
	return has_status("STUN")

func get_move_multiplier() -> float:
	var mult := 1.0
	if has_status("ROOT"):
		return 0.0
	if has_status("SLOW"):
		var s := get_status("SLOW")
		var potency = float(s.get("potency", 0.0))
		mult *= clamp(1.0 - potency, 0.2, 1.0)
	return mult

func get_damage_taken_multiplier(_dmg_type: int) -> float:
	var mult := 1.0
	var resist_key = ""
	match _dmg_type:
		DamageRef.DmgType.PIERCING: resist_key = "PIERCING"
		DamageRef.DmgType.EXPLOSIVE: resist_key = "EXPLOSIVE"
		DamageRef.DmgType.MELTING: resist_key = "MELTING"
		_: resist_key = ""
	if resist_key != "":
		var type_resist = clamp(float(resist.get(resist_key, 0.0)), 0.0, 0.8)
		if type_resist > 0.0:
			mult *= max(0.1, 1.0 - type_resist)
	if has_status("VULNERABLE"):
		var v := get_status("VULNERABLE")
		var pot = clamp(float(v.get("potency", 0.0)), 0.0, 1.0)
		mult *= 1.0 + pot
	if has_status("WARD"):
		var s := get_status("WARD")
		var potency = clamp(float(s.get("potency", 0.0)), 0.0, 0.9)
		mult *= max(0.1, 1.0 - potency)
	var resist_bonus = clamp(float(resist.get("WARD", 0.0)), 0.0, 0.8)
	if resist_bonus > 0.0:
		mult *= max(0.1, 1.0 - resist_bonus)
	return mult

func get_aim_mod_from_status() -> int:
	var mod = 0
	for s in statuses.values():
		var status_id = String(s.get("id", ""))
		var stacks = max(1, int(s.get("stacks", 1)))
		var potency = float(s.get("potency", 1.0))
		if status_id == "BLIND":
			mod -= int(round(15.0 * potency)) * stacks
	return mod

func get_damage_mod_from_status() -> float:
	var mult := 1.0
	for s in statuses.values():
		var status_id = String(s.get("id", ""))
		var stacks = max(1, int(s.get("stacks", 1)))
		var potency = float(s.get("potency", 1.0))
		if status_id == "WEAKEN":
			var penalty = clamp(0.15 * potency, 0.05, 0.5)
			mult *= max(0.4, 1.0 - penalty * stacks)
	return mult

func get_pa_max_mod_from_status() -> int:
	var mod = 0
	for s in statuses.values():
		var status_id = String(s.get("id", ""))
		var stacks = max(1, int(s.get("stacks", 1)))
		var potency = float(s.get("potency", 1.0))
		if status_id == "CRIPPLE":
			mod -= int(round(2.0 * potency)) * stacks
	return mod

func status_save_check(status_id: String, source_power: int) -> bool:
	var id = status_id.to_upper()
	var resist_bonus = clamp(float(resist.get(id, 0.0)), 0.0, 0.8)
	var def_stat = will
	if id == "BLEED":
		def_stat = vit
	elif id == "BURN":
		def_stat = will
	elif id == "ROOT":
		def_stat = dex
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
		var _stacks = int(s.get("stacks", 1))
		var potency = float(s.get("potency", 0.0))
		if id in ["BLEED", "REGEN", "BURN"]:
			parts.append("%s(%dt|p:%.1f)" % [id, turns, potency])
		elif id == "WARD":
			parts.append("%s(%d|%d%%)" % [id, turns, int(round(potency * 100.0))])
		elif id == "SLOW":
			parts.append("%s(%d|%d%%)" % [id, turns, int(round(potency * 100.0))])
		elif id == "VULNERABLE":
			parts.append("%s(%d|%d%%)" % [id, turns, int(round(potency * 100.0))])
		else:
			parts.append("%s(%d)" % [id, turns])
	return ", ".join(parts)


func get_status_list() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var keys = statuses.keys()
	keys.sort()
	for k in keys:
		var s = statuses[k]
		out.append(s)
	return out


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
	var status_pa_mod = get_pa_max_mod_from_status()
	pa_max = max(1, base_pa_max + pa_bonus - pa_penalty + status_pa_mod)
	pa = min(pa, pa_max)


func tick_cooldowns() -> void:
	for k in cooldowns.keys():
		cooldowns[k] = max(0, int(cooldowns[k]) - 1)


func cd_left(ability_name: String) -> int:
	return int(cooldowns.get(ability_name, 0))


func set_cd(ability_name: String, cd: int) -> void:
	cooldowns[ability_name] = max(0, cd)

# ---- Animation Hooks (future models/anims) ----
func play_idle() -> void:
	_play_animation("idle")

func play_run() -> void:
	_play_animation("run")

func play_attack() -> void:
	_play_animation("attack")

func play_cast() -> void:
	_play_animation("cast")

func play_crouch() -> void:
	_play_animation("crouch")

func _play_animation(anim_name: String) -> void:
	var anim_player := get_node_or_null("AnimationPlayer") as AnimationPlayer
	if anim_player != null and anim_player.has_animation(anim_name):
		anim_player.play(anim_name)
