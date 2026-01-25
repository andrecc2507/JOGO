extends RefCounted
class_name EnemyDB

const ARCHETYPES := {
	"brute": {
		"name": "Bruto Guardião",
		"role": "tank",
		"stats": {
			"hp_max": 28,
			"dex": 7,
			"agi": 6,
			"def": 14,
			"speed": 6,
			"perception": 10,
			"vision_range": 8,
			"pa_max": 8
		},
		"kit": "brute",
		"behavior": "GUARD",
		"aggression": 0.35,
		"patrol_mode": "radius",
		"patrol_radius": 3
	},
	"skirmisher": {
		"name": "Saqueador",
		"role": "skirmisher",
		"stats": {
			"hp_max": 18,
			"dex": 12,
			"agi": 14,
			"def": 8,
			"speed": 14,
			"perception": 12,
			"vision_range": 9,
			"pa_max": 8
		},
		"kit": "skirmisher",
		"behavior": "FLANK",
		"aggression": 0.75,
		"patrol_mode": "radius",
		"patrol_radius": 4
	},
	"caster": {
		"name": "Arcanista",
		"role": "caster",
		"stats": {
			"hp_max": 16,
			"dex": 10,
			"agi": 9,
			"def": 9,
			"speed": 10,
			"perception": 12,
			"vision_range": 10,
			"pa_max": 8
		},
		"kit": "caster",
		"behavior": "BACKLINE",
		"aggression": 0.55,
		"patrol_mode": "route"
	},
	"ambush": {
		"name": "Emboscador",
		"role": "ambush",
		"stats": {
			"hp_max": 14,
			"dex": 13,
			"agi": 15,
			"def": 6,
			"speed": 15,
			"perception": 13,
			"vision_range": 10,
			"pa_max": 8
		},
		"kit": "skirmisher",
		"behavior": "AMBUSH",
		"aggression": 0.8,
		"patrol_mode": "route"
	},
	"support": {
		"name": "Suporte Ritual",
		"role": "support",
		"stats": {
			"hp_max": 18,
			"dex": 9,
			"agi": 9,
			"def": 9,
			"speed": 10,
			"perception": 12,
			"vision_range": 9,
			"pa_max": 8
		},
		"kit": "caster",
		"behavior": "SUPPORT",
		"aggression": 0.4,
		"patrol_mode": "radius",
		"patrol_radius": 3
	}
}

static func get_archetype(id: String) -> Dictionary:
	return ARCHETYPES.get(id, ARCHETYPES["skirmisher"]).duplicate(true)
