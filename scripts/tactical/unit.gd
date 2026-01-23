extends Node3D
class_name Unit

@export var unit_name: String = "Unit"
@export var team: int = 0

@export var dex: int = 10
@export var agi: int = 10
@export var def: int = 10
@export var speed: int = 10

@export var perception: int = 10
@export var stealth: int = 0
@export var vision_range: int = 9

@export var pa_max: int = 8
var pa: int = 8

@export var base_max_hp: int = 20
var max_hp: int = 20
var hp: int = 20

var cell: Vector2i = Vector2i.ZERO

var overwatch: bool = false
var overwatch_used: bool = false
var dead: bool = false

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


func apply_damage(dmg: int) -> void:
	if dead:
		return
	hp = max(0, hp - max(0, dmg))
	if hp <= 0:
		dead = true


func apply_heal(amount: int) -> void:
	if dead:
		return
	hp = clamp(hp + max(0, amount), 0, max_hp)


func tick_cooldowns() -> void:
	for k in cooldowns.keys():
		cooldowns[k] = max(0, int(cooldowns[k]) - 1)


func cd_left(ability_name: String) -> int:
	return int(cooldowns.get(ability_name, 0))


func set_cd(ability_name: String, cd: int) -> void:
	cooldowns[ability_name] = max(0, cd)
