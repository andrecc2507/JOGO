extends RefCounted
class_name Damage

enum DmgType { PIERCING, EXPLOSIVE, MELTING }
enum MatType { WOOD, STONE, METAL, ICE }

static func mult_vs_material(dmg_type: int, mat: int) -> float:
	match dmg_type:
		DmgType.EXPLOSIVE:
			if mat == MatType.WOOD: return 1.35
			if mat == MatType.STONE: return 1.0
			if mat == MatType.ICE: return 1.15
			return 0.75 # METAL
		DmgType.MELTING:
			if mat == MatType.WOOD: return 0.9
			if mat == MatType.STONE: return 1.1
			if mat == MatType.ICE: return 1.5
			return 1.35 # METAL
		_:
			if mat == MatType.WOOD: return 1.05
			if mat == MatType.STONE: return 0.95
			if mat == MatType.ICE: return 1.10
			return 0.85 # METAL

static func apply_armor(raw_damage: int, armor: int) -> int:
	return max(1, raw_damage - armor)

static func compute_detail(base_damage: int, attacker: Unit, defender: Unit, dmg_type: int, crit: bool, context: Dictionary, variance_mult: float, crit_mult: float = 1.5) -> Dictionary:
	var dmg = max(1, base_damage)
	var varied = int(round(float(dmg) * variance_mult))
	if crit:
		varied = int(round(float(varied) * crit_mult))
	var true_damage = bool(context.get("true_damage", false))
	var armor_mult = float(context.get("armor_mult", 1.0))
	var damage_mult = float(context.get("damage_mult", 1.0))
	var def_bonus = defender.get_def_bonus() + defender.get_def_bonus_from_status()
	var armor = int((defender.get_armor_value() + def_bonus * 0.25) * armor_mult)
	var mitigated = varied
	if not true_damage:
		var eff_armor := float(armor)
		match dmg_type:
			DmgType.PIERCING:
				eff_armor *= 0.75
			DmgType.MELTING:
				eff_armor *= 0.50
			DmgType.EXPLOSIVE:
				eff_armor *= 0.85
			_:
				pass
		mitigated = apply_armor(varied, int(round(eff_armor)))
	var mult = defender.get_damage_taken_multiplier(dmg_type)
	var final = int(round(float(mitigated) * mult * damage_mult))
	return {
		"base": dmg,
		"varied": varied,
		"crit": crit,
		"armor": armor,
		"mitigated": mitigated,
		"mult": mult,
		"damage_mult": damage_mult,
		"final": final,
		"true_damage": true_damage
	}

static func compute_preview(base_damage: int, attacker: Unit, defender: Unit, dmg_type: int, context: Dictionary, variance_min: float, variance_max: float, crit_mult: float = 1.5) -> Dictionary:
	var min_detail = compute_detail(base_damage, attacker, defender, dmg_type, false, context, variance_min, crit_mult)
	var max_detail = compute_detail(base_damage, attacker, defender, dmg_type, false, context, variance_max, crit_mult)
	var crit_min_detail = compute_detail(base_damage, attacker, defender, dmg_type, true, context, variance_min, crit_mult)
	var crit_max_detail = compute_detail(base_damage, attacker, defender, dmg_type, true, context, variance_max, crit_mult)
	return {
		"min": int(min_detail.final),
		"max": int(max_detail.final),
		"crit_min": int(crit_min_detail.final),
		"crit_max": int(crit_max_detail.final)
	}

static func apply_damage(base_damage: int, attacker: Unit, defender: Unit, dmg_type: int, crit: bool, context: Dictionary, variance_mult: float, crit_mult: float = 1.5) -> Dictionary:
	var detail = compute_detail(base_damage, attacker, defender, dmg_type, crit, context, variance_mult, crit_mult)
	var applied = defender.apply_damage(int(detail.final))
	return {"detail": detail, "applied": applied}

static func type_name(dmg_type: int) -> String:
	match dmg_type:
		DmgType.PIERCING:
			return "PIERCING"
		DmgType.EXPLOSIVE:
			return "EXPLOSIVE"
		DmgType.MELTING:
			return "MELTING"
		_:
			return "UNKNOWN"
