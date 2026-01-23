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
		"apply_status": [],
		"hit_bonus": 0,
		"crit_bonus": 0,
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
static func bleed_shot() -> Dictionary:
	var a = _base("Bleed Shot", "W", 3, TargetMode.UNIT)
	a["range"] = 7
	a["cooldown"] = 2
	a["dmg"] = 5
	a["apply_status"] = [{"id": "BLEED", "turns": 2, "potency": 2}]
	a["tags"] = ["RANGED", "DAMAGE"]
	return a

# E — Concussive Bolt: stun on hit
static func concussive_bolt() -> Dictionary:
	var a = _base("Concussive Bolt", "E", 4, TargetMode.UNIT)
	a["range"] = 8
	a["cooldown"] = 3
	a["dmg"] = 6
	a["apply_status"] = [{"id": "STUN", "turns": 1, "potency": 1}]
	a["dmg_type"] = Damage.DmgType.PIERCING
	a["tags"] = ["SPELL", "DAMAGE"]
	return a

# R — Incendiary Burst: AOE burn
static func incendiary_burst() -> Dictionary:
	var a = _base("Incendiary Burst", "R", 6, TargetMode.CELL)
	a["range"] = 8
	a["cooldown"] = 4
	a["aoe_radius"] = 2
	a["dmg"] = 6
	a["dmg_type"] = Damage.DmgType.MELTING
	a["apply_status"] = [{"id": "BURN", "turns": 2, "potency": 2}]
	a["tags"] = ["AOE", "SPELL"]
	return a

# Default kit (QWER)
static func default_kit() -> Array[Dictionary]:
	return [dash(), bleed_shot(), concussive_bolt(), incendiary_burst()]
