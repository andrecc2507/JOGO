extends RefCounted
class_name EnemyDB

const ARCHETYPES := {
	"brute": {
		"name": "Bruto Guardião",
		"role": "tank",
		"stats": {
			"hp_max": 32,
			"dex": 7,
			"agi": 6,
			"def": 16,
			"speed": 6,
			"perception": 10,
			"vision_range": 8,
			"pa_max": 8
		},
		"kit": "brute",
		"behavior": "GUARD"
	},
	"skirmisher": {
		"name": "Saqueador",
		"role": "skirmisher",
		"stats": {
			"hp_max": 20,
			"dex": 12,
			"agi": 14,
			"def": 8,
			"speed": 14,
			"perception": 12,
			"vision_range": 9,
			"pa_max": 8
		},
		"kit": "skirmisher",
		"behavior": "FLANK"
	},
	"caster": {
		"name": "Arcanista",
		"role": "caster",
		"stats": {
			"hp_max": 18,
			"dex": 10,
			"agi": 9,
			"def": 9,
			"speed": 10,
			"perception": 12,
			"vision_range": 10,
			"pa_max": 8
		},
		"kit": "caster",
		"behavior": "BACKLINE"
	}
}

static func get_archetype(id: String) -> Dictionary:
	return ARCHETYPES.get(id, ARCHETYPES["skirmisher"]).duplicate(true)
