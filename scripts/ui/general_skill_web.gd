extends Control

const HQ_SCREEN_SCENE := "res://scene/ui/hq_screen.tscn"

@onready var title_label: Label = $TopBar/TitleLabel
@onready var back_button: Button = $TopBar/BackButton
@onready var xp_label: Label = $InfoBar/XPLabel
@onready var bonus_label: Label = $InfoBar/BonusLabel
@onready var skill_list: VBoxContainer = $Scroll/SkillList

var world_state: Node

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	back_button.pressed.connect(_on_back_pressed)
	_build_general_web()

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(HQ_SCREEN_SCENE)

func _build_general_web() -> void:
	for child in skill_list.get_children():
		child.queue_free()
	if world_state == null:
		xp_label.text = "WorldState indisponível."
		bonus_label.text = ""
		return
	var general_state: Dictionary = world_state.get_general_state()
	var xp := int(general_state.get("xp", 0))
	var bonuses: Dictionary = world_state.get_general_bonus_summary()
	xp_label.text = "XP do General: %d" % xp
	bonus_label.text = "Bônus ativos: PA %+d | Aim %+d | Ouro %+d%% | Recuperação %+d%%" % [
		int(bonuses.get("party_pa_max", 0)),
		int(bonuses.get("party_aim_bonus", 0)),
		int(bonuses.get("gold_reward_pct", 0)),
		int(bonuses.get("wound_recovery_pct", 0))
	]
	var tree: Dictionary = world_state.get_general_skill_tree()
	var unlocked: Array = general_state.get("skills_unlocked", [])
	for line in tree.get("lines", []):
		var line_header := Label.new()
		line_header.text = "Linha: %s" % String(line.get("name", ""))
		line_header.add_theme_font_size_override("font_size", 14)
		skill_list.add_child(line_header)
		for skill in line.get("skills", []):
			var row := VBoxContainer.new()
			row.add_theme_constant_override("separation", 4)
			var skill_id := String(skill.get("id", ""))
			var cost := int(skill.get("xp_cost", 0))
			var title := Label.new()
			var status := "Desbloqueada" if unlocked.has(skill_id) else "Bloqueada"
			title.text = "%s (XP %d) - %s" % [String(skill.get("name", "")), cost, status]
			row.add_child(title)
			var effects := Label.new()
			effects.text = _describe_effects(skill.get("effects", []))
			effects.add_theme_color_override("font_color", Color(0.75, 0.85, 0.95))
			row.add_child(effects)
			var button := Button.new()
			button.text = "Desbloquear"
			button.disabled = unlocked.has(skill_id) or xp < cost
			button.pressed.connect(func():
				if world_state.unlock_general_skill(skill_id):
					_build_general_web()
			)
			row.add_child(button)
			skill_list.add_child(row)

func _describe_effects(effects: Array) -> String:
	if effects.is_empty():
		return "Sem efeitos cadastrados."
	var parts: Array[String] = []
	for effect in effects:
		var effect_type := String(effect.get("type", ""))
		var value := String(effect.get("value", effect.get("delta", "")))
		parts.append("%s %+s" % [effect_type, value])
	return "Efeitos: %s" % ", ".join(parts)
