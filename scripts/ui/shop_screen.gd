extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"

@onready var back_button: Button = $TopBar/BackButton
@onready var gold_label: Label = $Body/GoldLabel
@onready var stock_content: VBoxContainer = $Body/StockPanel/StockMargin/StockContent
@onready var inventory_content: VBoxContainer = $Body/InventoryPanel/InventoryMargin/InventoryContent

var world_state: Node

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	back_button.pressed.connect(_on_back_pressed)
	_refresh()

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(MAP_SCREEN_SCENE)

func _refresh() -> void:
	if world_state == null:
		return
	gold_label.text = "Ouro: %d" % int(world_state.gold)
	for child in stock_content.get_children():
		child.queue_free()
	for child in inventory_content.get_children():
		child.queue_free()
	var stock_title := Label.new()
	stock_title.text = "Estoque"
	stock_content.add_child(stock_title)
	for item_id in world_state.get_shop_stock():
		var item = world_state.get_item_data(String(item_id))
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s (%d)" % [String(item.get("name", item_id)), int(item.get("price", 0))]
		var button := Button.new()
		button.text = "Comprar"
		button.pressed.connect(func():
			if world_state.purchase_item(String(item_id)):
				_refresh()
		)
		row.add_child(label)
		row.add_child(button)
		stock_content.add_child(row)
	var inv_title := Label.new()
	inv_title.text = "Inventário"
	inventory_content.add_child(inv_title)
	var items: Array = world_state.inventory.get("items", [])
	if items.is_empty():
		var empty := Label.new()
		empty.text = "Sem itens no inventário."
		inventory_content.add_child(empty)
		return
	for item_id in items:
		var item = world_state.get_item_data(String(item_id))
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s" % String(item.get("name", item_id))
		var sell := Button.new()
		sell.text = "Vender"
		sell.pressed.connect(func():
			if world_state.sell_item(String(item_id)):
				_refresh()
		)
		row.add_child(label)
		row.add_child(sell)
		inventory_content.add_child(row)
