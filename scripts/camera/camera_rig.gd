extends Node3D
class_name CameraRig

@export var edge_margin_px: int = 18         # área sensível nas bordas
@export var edge_pan_speed: float = 12.0     # velocidade do pan
@export var rotate_sens: float = 0.010       # sens do giro ao arrastar
@export var zoom_step: float = 1.2

@export var min_zoom: float = 6.0
@export var max_zoom: float = 26.0
@export var pitch_deg: float = -55.0         # ângulo tático

var _bounds_w: int = 16
var _bounds_h: int = 16
var _tile: float = 1.0

@onready var cam: Camera3D = $Camera3D

var _zoom: float = 14.0
var _rotating := false


func _ready() -> void:
	_apply_camera()


func set_bounds(w: int, h: int, tile_size: float) -> void:
	_bounds_w = w
	_bounds_h = h
	_tile = tile_size
	_clamp_to_bounds()


func center_on_world(p: Vector3) -> void:
	global_position.x = p.x
	global_position.z = p.z
	_clamp_to_bounds()


func _unhandled_input(event: InputEvent) -> void:
	if cam == null:
		return

	# Zoom: scroll
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom = clamp(_zoom - zoom_step, min_zoom, max_zoom)
			_apply_camera()
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom = clamp(_zoom + zoom_step, min_zoom, max_zoom)
			_apply_camera()

		# Segurar MMB para girar
		if event.button_index == MOUSE_BUTTON_MIDDLE:
			_rotating = true

	# Soltar MMB para parar giro
	if event is InputEventMouseButton and not event.pressed:
		if event.button_index == MOUSE_BUTTON_MIDDLE:
			_rotating = false

	# Giro: arrastar com MMB segurado
	if event is InputEventMouseMotion:
		if _rotating:
			rotation.y -= event.relative.x * rotate_sens
			_apply_camera()


func _process(delta: float) -> void:
	_edge_pan(delta)


func _edge_pan(delta: float) -> void:
	var vp := get_viewport()
	var size := vp.get_visible_rect().size
	var mp := vp.get_mouse_position()

	var dx := 0.0
	var dz := 0.0

	if mp.x <= edge_margin_px:
		dx -= 1.0
	elif mp.x >= size.x - edge_margin_px:
		dx += 1.0

	if mp.y <= edge_margin_px:
		dz -= 1.0
	elif mp.y >= size.y - edge_margin_px:
		dz += 1.0

	if dx == 0.0 and dz == 0.0:
		return

	# movimento relativo ao yaw do rig
	var right := global_transform.basis.x
	var forward := -global_transform.basis.z

	right.y = 0.0
	forward.y = 0.0
	right = right.normalized()
	forward = forward.normalized()

	var move := (right * dx + forward * dz)
	if move.length() > 0.0:
		move = move.normalized() * edge_pan_speed * delta

	global_position += Vector3(move.x, 0.0, move.z)
	_clamp_to_bounds()


func _apply_camera() -> void:
	cam.position = Vector3(0.0, _zoom, _zoom)
	cam.rotation_degrees.x = pitch_deg
	cam.look_at(global_position, Vector3.UP)


func _clamp_to_bounds() -> void:
	var minx = 0.5 * _tile
	var minz = 0.5 * _tile
	var maxx = float(_bounds_w) * _tile - 0.5 * _tile
	var maxz = float(_bounds_h) * _tile - 0.5 * _tile
	global_position.x = clamp(global_position.x, minx, maxx)
	global_position.z = clamp(global_position.z, minz, maxz)

# iniciar rotação também com ALT + LMB
if event is InputEventMouseButton and event.pressed:
	if event.button_index == MOUSE_BUTTON_LEFT and Input.is_key_pressed(KEY_ALT):
		_rotating = true

if event is InputEventMouseButton and not event.pressed:
	if event.button_index == MOUSE_BUTTON_LEFT:
		_rotating = false
