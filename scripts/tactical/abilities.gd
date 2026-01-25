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
		"status_potency": 0.0,
		"short_desc": ""
	}

static func attack_basic() -> Dictionary:
	var a = _base("Ataque Básico", "1", 4, TargetMode.UNIT)
	a["range"] = 8
	a["tags"] = ["ATTACK_NORMAL"]
	a["short_desc"] = "Ataque padrão com sua arma."
	return a

# 1 — Passo Sombrio: dash curto (mobilidade)
static func shadow_step() -> Dictionary:
	var a = _base("Passo Sombrio", "1", 3, TargetMode.CELL)
	a["range"] = 4
	a["cooldown"] = 2
	a["effects"] = [
		{"type": "dash"}
	]
	a["tags"] = ["MOVEMENT", "DASH"]
	a["short_desc"] = "Dash curto para reposicionamento."
	return a

# Hunker Down: defesa rápida (cobertura)
static func hunker_down() -> Dictionary:
	var a = _base("Hunker Down", "2", 2, TargetMode.SELF)
	a["effects"] = [
		{"type": "apply_status", "name": "HUNKER", "turns": 1, "potency": 0.0, "stacks": 1, "on_hit": false}
	]
	a["tags"] = ["HUNKER", "DEFENSIVE", "END_TURN"]
	a["short_desc"] = "Converte meia cobertura em cobertura completa até o próximo turno."
	return a

# Overwatch: encerra turno em vigilância
static func overwatch() -> Dictionary:
	var a = _base("Overwatch", "5", 3, TargetMode.SELF)
	a["tags"] = ["OVERWATCH", "END_TURN", "DEFENSIVE"]
	a["short_desc"] = "Entra em vigilância até o próximo turno."
	return a

static func guard_stance() -> Dictionary:
	var a = _base("Guardião", "4", 3, TargetMode.SELF)
	a["effects"] = [
		{"type": "apply_status", "name": "HUNKER", "turns": 2, "potency": 0.0, "stacks": 1, "on_hit": false}
	]
	a["tags"] = ["DEFENSIVE", "HUNKER", "END_TURN"]
	a["short_desc"] = "Postura defensiva prolongada."
	return a

# 2 — Estocada Precisa: dano direto
static func precise_thrust() -> Dictionary:
	var a = _base("Estocada Precisa", "2", 3, TargetMode.UNIT)
	a["range"] = 4
	a["cooldown"] = 1
	a["dmg"] = 6
	a["dmg_type"] = Damage.DmgType.PIERCING
	a["tags"] = ["DAMAGE"]
	a["short_desc"] = "Ataque direto de curto alcance."
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
	a["short_desc"] = "Enraíza o alvo."
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
	a["short_desc"] = "Cura direta em um aliado."
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
	a["short_desc"] = "Explosão em área com chance de queimadura."
	return a

# 5 — Parede de Fogo: sustentada em linha
static func fire_wall() -> Dictionary:
	var a = _base("Parede de Fogo", "5", 5, TargetMode.CELL)
	a["id"] = "FIRE_WALL"
	a["range"] = 6
	a["cooldown"] = 3
	a["channel"] = true
	a["wall_length"] = 5
	a["mp_cost"] = 3
	a["dmg_per_turn"] = 4
	a["effects"] = [
		{"type": "fire_wall"}
	]
	a["tags"] = ["SUSTAINED", "ZONE", "FIRE", "FIRE_WALL"]
	a["short_desc"] = "Linha de fogo sustentada que consome MP por turno."
	return a

static func vanguard_kit() -> Array[Dictionary]:
	var basic = attack_basic()
	var hunker = hunker_down()
	hunker["hotkey"] = "2"
	var guard = guard_stance()
	guard["hotkey"] = "3"
	var shadow = shadow_step()
	shadow["hotkey"] = "4"
	var watch = overwatch()
	watch["hotkey"] = "5"
	return [basic, hunker, guard, shadow, watch]

static func ranger_kit() -> Array[Dictionary]:
	var basic = attack_basic()
	var thrust = precise_thrust()
	thrust["hotkey"] = "2"
	var shadow = shadow_step()
	shadow["hotkey"] = "3"
	var watch = overwatch()
	watch["hotkey"] = "4"
	return [basic, thrust, shadow, watch]

static func mystic_kit() -> Array[Dictionary]:
	var basic = attack_basic()
	var heal = soothing_light()
	heal["hotkey"] = "2"
	var blaze = blazing_burst()
	blaze["hotkey"] = "3"
	var hunker = hunker_down()
	hunker["hotkey"] = "4"
	var wall = fire_wall()
	wall["hotkey"] = "5"
	return [basic, heal, blaze, hunker, wall]

static func brute_kit() -> Array[Dictionary]:
	var basic = attack_basic()
	var guard = guard_stance()
	guard["hotkey"] = "2"
	return [basic, guard]

static func skirmisher_kit() -> Array[Dictionary]:
	var basic = attack_basic()
	var shadow = shadow_step()
	shadow["hotkey"] = "2"
	return [basic, shadow]

static func caster_kit() -> Array[Dictionary]:
	var basic = attack_basic()
	var blaze = blazing_burst()
	blaze["hotkey"] = "2"
	var shackles = rune_shackles()
	shackles["hotkey"] = "3"
	return [basic, blaze, shackles]

static func kit_by_id(kit_id: String) -> Array[Dictionary]:
	match kit_id:
		"vanguard":
			return vanguard_kit()
		"ranger":
			return ranger_kit()
		"mystic":
			return mystic_kit()
		"brute":
			return brute_kit()
		"skirmisher":
			return skirmisher_kit()
		"caster":
			return caster_kit()
	return ranger_kit()

static func ability_by_id(ability_id: String) -> Dictionary:
	match ability_id:
		"attack_basic":
			return attack_basic()
		"shadow_step":
			return shadow_step()
		"hunker_down":
			return hunker_down()
		"overwatch":
			return overwatch()
		"guard_stance":
			return guard_stance()
		"precise_thrust":
			return precise_thrust()
		"rune_shackles":
			return rune_shackles()
		"soothing_light":
			return soothing_light()
		"blazing_burst":
			return blazing_burst()
		"fire_wall":
			return fire_wall()
	return {}

static func default_kit() -> Array[Dictionary]:
	return ranger_kit()
