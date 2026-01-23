extends Node3D
class_name CombatFX

var _canvas_layer: CanvasLayer

func spawn_tracer(from: Vector3, to: Vector3) -> void:
	var mesh_instance := MeshInstance3D.new()
	add_child(mesh_instance)

	var im := ImmediateMesh.new()
	mesh_instance.mesh = im

	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.95, 0.6, 0.9)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.9, 0.6)

	im.surface_begin(Mesh.PRIMITIVE_LINE_STRIP, mat)
	im.surface_add_vertex(from)
	im.surface_add_vertex(to)
	im.surface_end()

	var timer = get_tree().create_timer(0.12)
	timer.timeout.connect(func():
		if is_instance_valid(mesh_instance):
			mesh_instance.queue_free()
	)

func spawn_floating_text(text: String, world_pos: Vector3, color: Color = Color(1, 1, 1, 1)) -> void:
	if ClassDB.class_exists("Label3D"):
		var label := Label3D.new()
		label.text = text
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.position = world_pos + Vector3(0, 0.65, 0)
		add_child(label)

		var start_pos = label.position
		var end_pos = start_pos + Vector3(0, 0.6, 0)
		if _has_property(label, "modulate"):
			label.set("modulate", color)

		var tween = create_tween()
		tween.tween_property(label, "position", end_pos, 0.7).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		if _has_property(label, "modulate"):
			tween.parallel().tween_property(label, "modulate", Color(1, 1, 1, 0), 0.7)
		tween.finished.connect(func():
			if is_instance_valid(label):
				label.queue_free()
		)
		return

	var layer = _ensure_canvas_layer()
	if layer == null:
		return
	var label2d := Label.new()
	label2d.text = text
	label2d.modulate = color
	layer.add_child(label2d)

	var cam = get_viewport().get_camera_3d()
	if cam != null:
		label2d.global_position = cam.unproject_position(world_pos)
	else:
		label2d.global_position = Vector2.ZERO

	var start = label2d.global_position
	var end = start + Vector2(0, -40)

	var tween2 = create_tween()
	tween2.tween_property(label2d, "global_position", end, 0.7).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween2.parallel().tween_property(label2d, "modulate", Color(1, 1, 1, 0), 0.7)
	tween2.finished.connect(func():
		if is_instance_valid(label2d):
			label2d.queue_free()
	)

func shake_node(n: Node3D, intensity: float = 0.08, time: float = 0.12) -> void:
	if n == null:
		return
	var orig = n.position
	var offset = Vector3(randf_range(-intensity, intensity), 0.0, randf_range(-intensity, intensity))
	var tween = create_tween()
	tween.tween_property(n, "position", orig + offset, time * 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.tween_property(n, "position", orig, time * 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)

func _ensure_canvas_layer() -> CanvasLayer:
	if _canvas_layer != null:
		return _canvas_layer
	_canvas_layer = CanvasLayer.new()
	_canvas_layer.layer = 100
	add_child(_canvas_layer)
	return _canvas_layer

func _has_property(obj: Object, prop: String) -> bool:
	for item in obj.get_property_list():
		if String(item.get("name", "")) == prop:
			return true
	return false
