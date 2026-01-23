extends Node3D
class_name CameraRig

@export var pan_speed: float = 10.0
@export var fast_pan_multiplier: float = 2.0
@export var rotate_sensitivity: float = 0.01
@export var zoom_step: float = 2.0
@export var min_zoom: float = 6.0
@export var max_zoom: float = 26.0
@export var min_pitch_deg: float = -80.0
@export var max_pitch_deg: float = -25.0
@export var position_lerp: float = 10.0
@export var rotation_lerp: float = 12.0
@export var zoom_lerp: float = 10.0
@export var edge_pan_margin_px: int = 0
@export var edge_pan_speed: float = 12.0

var _bounds_w: int = 16
var _bounds_h: int = 16
var _tile: float = 1.0

var _target_pos: Vector3
var _current_pos: Vector3
var _target_yaw: float = 0.0
var _current_yaw: float = 0.0
var _target_pitch: float = deg_to_rad(-55.0)
var _current_pitch: float = deg_to_rad(-55.0)
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
	_current_pitch = _pivot.rotation.x
	_target_pitch = _pivot.rotation.x

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

func _unhandled_input(event: InputEvent) -> void:
	if _cam == null:
		return

	if event is InputEventMouseButton:
		if event.pressed:
			if event.button_index == MOUSE_BUTTON_WHEEL_UP:
				_target_zoom = clamp(_target_zoom - zoom_step, min_zoom, max_zoom)
			elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				_target_zoom = clamp(_target_zoom + zoom_step, min_zoom, max_zoom)
			elif event.button_index == MOUSE_BUTTON_RIGHT:
				_rotating = true
			elif event.button_index == MOUSE_BUTTON_MIDDLE:
				_panning = true
				_last_pan_point = _get_ground_point(get_viewport().get_mouse_position())
		else:
			if event.button_index == MOUSE_BUTTON_RIGHT:
				_rotating = false
			elif event.button_index == MOUSE_BUTTON_MIDDLE:
				_panning = false

	if event is InputEventMouseMotion:
		if _rotating:
			_target_yaw -= event.relative.x * rotate_sensitivity
			_target_pitch = clamp(_target_pitch - event.relative.y * rotate_sensitivity, deg_to_rad(min_pitch_deg), deg_to_rad(max_pitch_deg))
		if _panning:
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

	_current_pos = _current_pos.lerp(_target_pos, 1.0 - exp(-position_lerp * delta))
	_current_yaw = lerp_angle(_current_yaw, _target_yaw, 1.0 - exp(-rotation_lerp * delta))
	_current_pitch = lerp_angle(_current_pitch, _target_pitch, 1.0 - exp(-rotation_lerp * delta))
	_current_zoom = lerp(_current_zoom, _target_zoom, 1.0 - exp(-zoom_lerp * delta))

	_apply_transform(false)

func _handle_keyboard_pan(delta: float) -> void:
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
	var speed = pan_speed * (fast_pan_multiplier if Input.is_key_pressed(KEY_SHIFT) else 1.0)
	_target_pos += Vector3(move.x, 0.0, move.z) * speed * delta
	_target_pos = _clamp_to_bounds(_target_pos)

func _handle_edge_pan(delta: float) -> void:
	if edge_pan_margin_px <= 0:
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
		_pivot.rotation.x = _target_pitch
		if _cam != null:
			_cam.position = Vector3(0.0, 0.0, _target_zoom)
	else:
		global_position = _current_pos
		rotation.y = _current_yaw
		_pivot.rotation.x = _current_pitch
		if _cam != null:
			_cam.position = Vector3(0.0, 0.0, _current_zoom)

func _clamp_to_bounds(pos: Vector3) -> Vector3:
	var minx = 0.5 * _tile
	var minz = 0.5 * _tile
	var maxx = float(_bounds_w) * _tile - 0.5 * _tile
	var maxz = float(_bounds_h) * _tile - 0.5 * _tile
	pos.x = clamp(pos.x, minx, maxx)
	pos.z = clamp(pos.z, minz, maxz)
	return pos

func _get_ground_point(screen_pos: Vector2) -> Variant:
	if _cam == null:
		return null
	var plane = Plane(Vector3.UP, 0.0)
	var from = _cam.project_ray_origin(screen_pos)
	var dir = _cam.project_ray_normal(screen_pos)
	var hit = plane.intersects_ray(from, dir)
	return hit
