# res://scripts/tactical/abilities.gd
extends RefCounted
class_name Abilities

# Targeting rules for abilities
enum TargetMode { CELL, UNIT, SELF }

# Helper: common fields
static func _base(name: String, hotkey: String, cost_pa: int, target_mode: int) -> Dictionary:
	return {
		"name": name,
		"hotkey": hotkey,
		"cost_pa": cost_pa,
		"target_mode": target_mode,
		"range": 0,
		"cooldown": 0,
		"cast_time": 0,     # turns to complete (0 = instant)
		"channel": false,   # if true, keeps "channeling" until cancelled
		"aoe_radius": 0,
		"dmg": 0,
		"heal": 0,
		"dmg_type": Damage.DmgType.PIERCING,
		"tags": []          # e.g. ["MOVEMENT"], ["HEAL"], ["AOE"]
	}

# Q — Dash: move extra tiles in same turn
static func dash() -> Dictionary:
	var a = _base("Dash", "Q", 2, TargetMode.CELL)
	a["range"] = 6
	a["cooldown"] = 2
	a["tags"] = ["MOVEMENT"]
	return a

# W — Heal: small single-target heal
static func heal() -> Dictionary:
	var a = _base("Heal", "W", 3, TargetMode.UNIT)
	a["range"] = 6
	a["cooldown"] = 2
	a["heal"] = 6
	a["tags"] = ["HEAL"]
	return a

# E — Channel Bolt: 1-turn cast, then damage
static func channel_bolt() -> Dictionary:
	var a = _base("Channel Bolt", "E", 4, TargetMode.UNIT)
	a["range"] = 9
	a["cooldown"] = 3
	a["cast_time"] = 1
	a["dmg"] = 7
	a["dmg_type"] = Damage.DmgType.PIERCING
	a["tags"] = ["DAMAGE"]
	return a

# R — Arcane Bomb: AOE damage
static func arcane_bomb() -> Dictionary:
	var a = _base("Arcane Bomb", "R", 6, TargetMode.CELL)
	a["range"] = 8
	a["cooldown"] = 4
	a["aoe_radius"] = 2
	a["dmg"] = 6
	a["dmg_type"] = Damage.DmgType.EXPLOSIVE
	a["tags"] = ["AOE"]
	return a

# Default kit (QWER)
static func default_kit() -> Array[Dictionary]:
	return [dash(), heal(), channel_bolt(), arcane_bomb()]
