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

# 1 — Passo Sombrio: dash curto (mobilidade)
static func shadow_step() -> Dictionary:
	var a = _base("Passo Sombrio", "1", 3, TargetMode.CELL)
	a["range"] = 4
	a["cooldown"] = 2
	a["effects"] = [
		{"type": "dash"}
	]
	a["tags"] = ["MOVEMENT", "DASH"]
	return a

# 2 — Estocada Precisa: dano direto
static func precise_thrust() -> Dictionary:
	var a = _base("Estocada Precisa", "2", 3, TargetMode.UNIT)
	a["range"] = 4
	a["cooldown"] = 1
	a["dmg"] = 6
	a["dmg_type"] = Damage.DmgType.PIERCING
	a["tags"] = ["DAMAGE"]
	return a

# 3 — Grilhões Rúnicos: controle (ROOT)
static func rune_shackles() -> Dictionary:
	var a = _base("Grilhões Rúnicos", "3", 4, TargetMode.UNIT)
	a["range"] = 4
	a["cooldown"] = 2
	a["dmg"] = 0
	a["dmg_type"] = Damage.DmgType.PIERCING
	a["effects"] = [
		{"type": "apply_status", "name": "ROOT", "turns": 1, "potency": 0.0, "stacks": 1, "on_hit": true}
	]
	a["tags"] = ["ROOT", "CONTROL", "SPELL"]
	return a

# 3 — Luz Reconfortante: cura direta
static func soothing_light() -> Dictionary:
	var a = _base("Luz Reconfortante", "3", 3, TargetMode.UNIT)
	a["range"] = 4
	a["cooldown"] = 2
	a["effects"] = [
		{"type": "heal", "amount": 6}
	]
	a["tags"] = ["HEAL", "SUPPORT"]
	return a

# 4 — Explosão Ígnea: AOE (cast 1 turno)
static func blazing_burst() -> Dictionary:
	var a = _base("Explosão Ígnea", "4", 6, TargetMode.CELL)
	a["range"] = 5
	a["cooldown"] = 3
	a["cast_time"] = 1
	a["effects"] = [
		{
			"type": "aoe",
			"amount": 8,
			"radius": 2,
			"dmg_type": Damage.DmgType.EXPLOSIVE,
			"apply_status": {"name": "BURN", "turns": 2, "potency": 2.0, "stacks": 1, "on_hit": true}
		}
	]
	a["tags"] = ["AOE", "BURN", "SPELL"]
	return a

# Default kit (1-4)
static func default_kit() -> Array[Dictionary]:
	return [shadow_step(), precise_thrust(), soothing_light(), blazing_burst()]
