extends Node3D
class_name CameraRig

@export var pan_speed := 18.0
@export var rotate_speed := 1.4
@export var zoom_speed := 2.0
@export var zoom_min := 6.0
@export var zoom_max := 26.0
@export var smoothing := 10.0
@export var allow_rotate := true
@export var allow_pan := true
@export var allow_zoom := true

@export var edge_pan_margin_px: int = 0
@export var edge_pan_speed: float = 12.0
@export var pan_margin_tiles: float = 0.5

var _bounds_w: int = 16
var _bounds_h: int = 16
var _tile: float = 1.0

var _target_pos: Vector3
var _current_pos: Vector3
var _target_yaw: float = 0.0
var _current_yaw: float = 0.0
var _target_zoom: float = 14.0
var _current_zoom: float = 14.0

var _rotating: bool = false
var _panning: bool = false
var _last_pan_point: Vector3

var _pivot: Node3D
var _cam: Camera3D

func _ready() -> void:
	_pivot = get_node_or_null("Pivot") as Node3D
	_cam = get_node_or_null("Pivot/Camera3D") as Camera3D

	if _pivot == null:
		_pivot = Node3D.new()
		_pivot.name = "Pivot"
		add_child(_pivot)

	if _cam == null:
		_cam = get_node_or_null("Camera3D") as Camera3D
		if _cam == null:
			_cam = find_child("Camera3D", true, false) as Camera3D

	if _cam != null and _cam.get_parent() != _pivot:
		var old_global = _cam.global_transform
		_cam.get_parent().remove_child(_cam)
		_pivot.add_child(_cam)
		_cam.global_transform = old_global

	_target_pos = global_position
	_current_pos = global_position
	_current_yaw = rotation.y
	_target_yaw = rotation.y

	if _cam != null:
		_current_zoom = _cam.position.z
		_target_zoom = _current_zoom

	_apply_transform(true)

func set_bounds(w: int, h: int, cell_size: float) -> void:
	_bounds_w = w
	_bounds_h = h
	_tile = cell_size
	_target_pos = _clamp_to_bounds(_target_pos)
	_current_pos = _clamp_to_bounds(_current_pos)

func center_on_world(pos: Vector3) -> void:
	_target_pos.x = pos.x
	_target_pos.z = pos.z
	_target_pos = _clamp_to_bounds(_target_pos)

func nudge_to_world(pos: Vector3, strength: float = 1.0) -> void:
	var t = clamp(strength, 0.0, 1.0)
	var delta = Vector3(pos.x - _target_pos.x, 0.0, pos.z - _target_pos.z)
	_target_pos += delta * (0.2 * t)
	_target_pos = _clamp_to_bounds(_target_pos)

func _unhandled_input(event: InputEvent) -> void:
	if _cam == null:
		return

	if event is InputEventMouseButton:
		if event.pressed:
			if allow_zoom and event.button_index == MOUSE_BUTTON_WHEEL_UP:
				_target_zoom = clamp(_target_zoom - zoom_speed, zoom_min, zoom_max)
			elif allow_zoom and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				_target_zoom = clamp(_target_zoom + zoom_speed, zoom_min, zoom_max)
			elif allow_rotate and event.button_index == MOUSE_BUTTON_RIGHT:
				_rotating = true
			elif allow_pan and event.button_index == MOUSE_BUTTON_MIDDLE:
				_panning = true
				_last_pan_point = _get_ground_point(get_viewport().get_mouse_position())
		else:
			if event.button_index == MOUSE_BUTTON_RIGHT:
				_rotating = false
			elif event.button_index == MOUSE_BUTTON_MIDDLE:
				_panning = false

	if event is InputEventMouseMotion:
		if allow_rotate and _rotating:
			_target_yaw -= event.relative.x * rotate_speed * 0.01
		if allow_pan and _panning:
			var current_point = _get_ground_point(event.position)
			if current_point != null and _last_pan_point != null:
				var delta = _last_pan_point - current_point
				_target_pos += Vector3(delta.x, 0.0, delta.z)
				_target_pos = _clamp_to_bounds(_target_pos)
				_last_pan_point = current_point

func _process(delta: float) -> void:
	if _cam == null:
		return

	_handle_keyboard_pan(delta)
	_handle_edge_pan(delta)
	_handle_keyboard_rotate(delta)

	_current_pos = _current_pos.lerp(_target_pos, 1.0 - exp(-smoothing * delta))
	_current_yaw = lerp_angle(_current_yaw, _target_yaw, 1.0 - exp(-smoothing * delta))
	_current_zoom = lerp(_current_zoom, _target_zoom, 1.0 - exp(-smoothing * delta))

	_apply_transform(false)

func _handle_keyboard_pan(delta: float) -> void:
	if not allow_pan:
		return
	var dx := 0.0
	var dz := 0.0

	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		dz -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		dz += 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		dx -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		dx += 1.0

	if dx == 0.0 and dz == 0.0:
		return

	var right := global_transform.basis.x
	var forward := -global_transform.basis.z
	right.y = 0.0
	forward.y = 0.0
	right = right.normalized()
	forward = forward.normalized()

	var move := (right * dx + forward * dz)
	if move.length() > 0.0:
		move = move.normalized()
	_target_pos += Vector3(move.x, 0.0, move.z) * pan_speed * delta
	_target_pos = _clamp_to_bounds(_target_pos)

func _handle_keyboard_rotate(delta: float) -> void:
	if not allow_rotate:
		return
	var dir := 0.0
	if Input.is_key_pressed(KEY_Q):
		dir -= 1.0
	if Input.is_key_pressed(KEY_E):
		dir += 1.0
	if dir == 0.0:
		return
	_target_yaw += dir * rotate_speed * delta

func _handle_edge_pan(delta: float) -> void:
	if edge_pan_margin_px <= 0 or not allow_pan:
		return
	var vp := get_viewport()
	var size := vp.get_visible_rect().size
	var mp := vp.get_mouse_position()

	var dx := 0.0
	var dz := 0.0

	if mp.x <= edge_pan_margin_px:
		dx -= 1.0
	elif mp.x >= size.x - edge_pan_margin_px:
		dx += 1.0

	if mp.y <= edge_pan_margin_px:
		dz -= 1.0
	elif mp.y >= size.y - edge_pan_margin_px:
		dz += 1.0

	if dx == 0.0 and dz == 0.0:
		return

	var right := global_transform.basis.x
	var forward := -global_transform.basis.z
	right.y = 0.0
	forward.y = 0.0
	right = right.normalized()
	forward = forward.normalized()

	var move := (right * dx + forward * dz)
	if move.length() > 0.0:
		move = move.normalized()
	_target_pos += Vector3(move.x, 0.0, move.z) * edge_pan_speed * delta
	_target_pos = _clamp_to_bounds(_target_pos)

func _apply_transform(immediate: bool) -> void:
	if immediate:
		global_position = _target_pos
		rotation.y = _target_yaw
		if _cam:
			_cam.position.z = _target_zoom
		return

	global_position = _current_pos
	rotation.y = _current_yaw
	if _cam:
		_cam.position.z = _current_zoom

func _clamp_to_bounds(pos: Vector3) -> Vector3:
	var min_x = _tile * pan_margin_tiles
	var min_z = _tile * pan_margin_tiles
	var max_x = (_bounds_w - 1) * _tile - _tile * pan_margin_tiles
	var max_z = (_bounds_h - 1) * _tile - _tile * pan_margin_tiles
	if _bounds_w <= 1:
		min_x = 0.0
		max_x = 0.0
	if _bounds_h <= 1:
		min_z = 0.0
		max_z = 0.0
	pos.x = clamp(pos.x, min_x, max_x)
	pos.z = clamp(pos.z, min_z, max_z)
	return pos

func _get_ground_point(screen_pos: Vector2):
	if _cam == null:
		return null
	var from = _cam.project_ray_origin(screen_pos)
	var dir = _cam.project_ray_normal(screen_pos)
	if abs(dir.y) < 0.0001:
		return null
	var t = -from.y / dir.y
	if t < 0.0:
		return null
	return from + dir * t
