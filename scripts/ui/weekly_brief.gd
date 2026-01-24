extends Control

# COMO USAR:
# 1) Exiba esta cena quando weekly_brief_due for true.
# 2) Mostre alertas e gates liberados.
# 3) Continue para retornar ao Map Screen.

const MAP_SCENE := "res://scene/ui/map_screen.tscn"

@onready var summary_label: Label = $Panel/SummaryLabel
@onready var continue_button: Button = $Panel/ContinueButton

var world_state: Node

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	continue_button.pressed.connect(_on_continue_pressed)
	_refresh_summary()

func _refresh_summary() -> void:
	if world_state == null:
		return
	var lines: Array[String] = []
	lines.append("Mudanças do dia:")
	for alert in world_state.alerts:
		lines.append("- %s P:%d R:%d" % [String(alert.get("region_id", "")), int(alert.get("pressure", 0)), int(alert.get("rifts", 0))])
	lines.append("")
	lines.append("Gates liberados:")
	var gates: Array = world_state.progression.get("gates_unlocked", [])
	for gate in gates:
		lines.append("- %s" % String(gate))
	summary_label.text = "\n".join(lines)

func _on_continue_pressed() -> void:
	if world_state != null:
		world_state.progression["weekly_brief_due"] = false
	get_tree().change_scene_to_file(MAP_SCENE)
