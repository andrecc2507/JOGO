extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"

@onready var title_label: Label = $Panel/Content/TitleLabel
@onready var summary_label: Label = $Panel/Content/SummaryLabel
@onready var loot_label: Label = $Panel/Content/LootLabel
@onready var continue_button: Button = $Panel/Content/ContinueButton

var world_state: Node

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	continue_button.pressed.connect(_on_continue_pressed)
	_refresh()

func _refresh() -> void:
	var bridge = get_node_or_null("/root/TacticalBridge")
	if bridge == null or bridge.last_result == null:
		summary_label.text = "Nenhum relatório disponível."
		return
	var result = bridge.last_result
	title_label.text = "Missão concluída" if result.success else "Missão falhou"
	var lines: Array[String] = []
	lines.append("Sucesso: %s" % ("Sim" if result.success else "Não"))
	lines.append("XP total: %d" % int(result.xp_total))
	summary_label.text = "\n".join(lines)
	var loot: Dictionary = result.loot
	var loot_items: Array = loot.get("items", [])
	var loot_lines: Array[String] = []
	loot_lines.append("Ouro: %d" % int(loot.get("gold", 0)))
	if loot_items.is_empty():
		loot_lines.append("Itens: nenhum")
	else:
		loot_lines.append("Itens: %s" % ", ".join(loot_items))
	loot_label.text = "\n".join(loot_lines)

func _on_continue_pressed() -> void:
	get_tree().change_scene_to_file(MAP_SCREEN_SCENE)
