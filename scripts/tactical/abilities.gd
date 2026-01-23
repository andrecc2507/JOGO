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
		"tags": [],         # e.g. ["MOVEMENT"], ["HEAL"], ["AOE"]
		"dmg": 0,
		"dmg_type": Damage.DmgType.PIERCING,
		"status_id": "",
		"status_duration": 0,
		"status_potency": 0.0
	}

# Q — Golpe Atordoante: dano baixo + STUN
static func stun_strike() -> Dictionary:
	var a = _base("Golpe Atordoante", "Q", 4, TargetMode.UNIT)
	a["range"] = 2
	a["cooldown"] = 2
	a["dmg"] = 4
	a["dmg_type"] = Damage.DmgType.PIERCING
	a["status_id"] = "STUN"
	a["status_duration"] = 1
	a["tags"] = ["STUN", "MELEE"]
	return a

# W — Corte Profundo: dano médio + BLEED
static func deep_cut() -> Dictionary:
	var a = _base("Corte Profundo", "W", 4, TargetMode.UNIT)
	a["range"] = 3
	a["cooldown"] = 2
	a["dmg"] = 6
	a["dmg_type"] = Damage.DmgType.PIERCING
	a["status_id"] = "BLEED"
	a["status_duration"] = 2
	a["status_potency"] = 2.0
	a["tags"] = ["BLEED", "DOT"]
	return a

# E — Benção: REGEN ou WARD
static func blessing() -> Dictionary:
	var a = _base("Benção", "E", 4, TargetMode.UNIT)
	a["range"] = 3
	a["cooldown"] = 3
	a["status_id"] = "REGEN"
	a["status_duration"] = 2
	a["status_potency"] = 2.0
	a["status_alt_id"] = "WARD"
	a["status_alt_potency"] = 0.3
	a["tags"] = ["REGEN", "WARD", "BUFF"]
	return a

# R — Raio Canalizado: dano alto + SLOW (cast 1 turno)
static func channeled_ray() -> Dictionary:
	var a = _base("Raio Canalizado", "R", 6, TargetMode.UNIT)
	a["range"] = 6
	a["cooldown"] = 3
	a["cast_time"] = 1
	a["dmg"] = 10
	a["dmg_type"] = Damage.DmgType.MELTING
	a["status_id"] = "SLOW"
	a["status_duration"] = 2
	a["status_potency"] = 0.35
	a["tags"] = ["NUKE", "SLOW", "SPELL"]
	return a

# Default kit (QWER)
static func default_kit() -> Array[Dictionary]:
	return [stun_strike(), deep_cut(), blessing(), channeled_ray()]
