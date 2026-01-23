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
