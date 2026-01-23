extends RefCounted
class_name Gear

enum Slot { WEAPON, ARMOR, ACCESSORY }

static func weapon(name: String, dmg: int, aim_bonus: int, range_bonus: float) -> Dictionary:
	return {
		"type": "weapon",
		"slot": Slot.WEAPON,
		"name": name,
		"dmg": dmg,
		"aim_bonus": aim_bonus,
		"range_bonus": range_bonus
	}

static func armor(name: String, armor_value: int, def_bonus: int) -> Dictionary:
	return {
		"type": "armor",
		"slot": Slot.ARMOR,
		"name": name,
		"armor": armor_value,
		"def_bonus": def_bonus
	}

static func accessory(name: String, hp_bonus: int, vision_bonus: int, stealth_bonus: int) -> Dictionary:
	return {
		"type": "accessory",
		"slot": Slot.ACCESSORY,
		"name": name,
		"hp_bonus": hp_bonus,
		"vision_bonus": vision_bonus,
		"stealth_bonus": stealth_bonus
	}

static func slot_name(slot: int) -> String:
	match slot:
		Slot.WEAPON: return "WEAPON"
		Slot.ARMOR: return "ARMOR"
		Slot.ACCESSORY: return "ACCESSORY"
		_: return "?"
