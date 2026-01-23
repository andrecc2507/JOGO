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
		"effects": [],
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
	a["effects"] = [{"type": "dash"}]
	return a

# W — Heal: small single-target heal
static func heal() -> Dictionary:
	var a = _base("Heal", "W", 3, TargetMode.UNIT)
	a["range"] = 6
	a["cooldown"] = 2
	a["effects"] = [{"type": "heal", "amount": 6}]
	a["tags"] = ["HEAL"]
	return a

# E — Arc Bolt: damage + low chance stun/burn
static func arc_bolt() -> Dictionary:
	var a = _base("Arc Bolt", "E", 4, TargetMode.UNIT)
	a["range"] = 8
	a["cooldown"] = 3
	a["effects"] = [
		{"type": "damage", "amount": 7, "dmg_type": Damage.DmgType.PIERCING},
		{"type": "apply_status", "name": "Stun", "turns": 1, "chance": 0.2, "on_hit": true},
		{"type": "apply_status", "name": "Burn", "turns": 2, "chance": 0.35, "params": {"dot": 2}, "on_hit": true}
	]
	a["tags"] = ["SPELL", "DAMAGE"]
	return a

# R — Fireburst: AOE burn
static func fireburst() -> Dictionary:
	var a = _base("Fireburst", "R", 6, TargetMode.CELL)
	a["range"] = 8
	a["cooldown"] = 4
	a["aoe_radius"] = 2
	a["effects"] = [
		{
			"type": "aoe",
			"amount": 7,
			"radius": 2,
			"dmg_type": Damage.DmgType.MELTING,
			"apply_status": {"name": "Burn", "turns": 2, "params": {"dot": 3}}
		}
	]
	a["tags"] = ["AOE", "SPELL"]
	return a

# Default kit (QWER)
static func default_kit() -> Array[Dictionary]:
	return [dash(), heal(), arc_bolt(), fireburst()]
