# tools/bossmeasure.gd - what each boss does to a player who stands, and to one
# who dodges.
#
# NOT PART OF THE WEBSITE. It reads the game, so it runs inside the game
# project, headless, as fast as the machine allows (--fixed-fps turns off
# real-time pacing):
#   godot --headless --path <game> --fixed-fps 80 --script <this file> -- seconds=300
# Its output goes through tools/bosssim_data.mjs into bosssim-data.js.
# BOSSSIM.md has the whole procedure.
#
# For each of the seven bosses and each phase (health held at 83%, 50% and
# 17%), the boss - held where it stands - fights a stand-in player in one of
# three stances:
#   melee   28 px away, inside its 40 px swing, holding its ground
#   range   90 px away, inside its 120 px attack range but out of reach,
#           holding its ground
#   dodge   starting at range, and moving: every frame it steps to wherever
#           nearby is least dangerous in the next half second - out of rings
#           about to erupt, out of the path of orbs, off puddles and craters,
#           out of the swing - while staying near range (DodgeBot below)
# Holding its ground means it never chooses to move, but a shove or a pull
# still moves it, and it walks back. All three carry the game's own effects
# (statuseffects.gd): a chilled stand-in walks slower, a rooted one not at all.
# Since 0.77.0 (THE KITS in bossenemy.gd) the room has a bullet zone, so the
# boss throws its real volleys.
#
# Every hit that lands is recorded by its size and by what dealt it: an orb
# (the zone), a burn tick (the effects), or - by size, as before - the swing,
# a stalagmite, a stalker's pillar or a puddle tick. With it, every effect that
# started and what the boss put on the floor. One JSON line per run, prefixed
# BOSSMEASURE.
extends SceneTree

const BOSSES := [
	["light", "res://scene/enemy/lightboss.tscn"],
	["wind", "res://scene/enemy/windboss.tscn"],
	["water", "res://scene/enemy/waterboss.tscn"],
	["ice", "res://scene/enemy/iceboss.tscn"],
	["earth", "res://scene/enemy/earthboss.tscn"],
	["fire", "res://scene/enemy/fireboss.tscn"],
	["crowned", "res://scene/enemy/bossenemy.tscn"],
]
const PHASE_HEALTH := [0.83, 0.50, 0.17]
const STANCES := [["melee", 28.0], ["range", 90.0], ["dodge", 90.0]]
const TICKS := 80
# The stand-in walks at 90, the player's own speed at agility 1 (player.gd).


# THE PARTS THAT NAME THE GAME'S CLASSES, compiled once the game is up (_run).
# A --script is compiled before the game's autoloads exist, and BulletZone
# leads through EnemyData to GameConstants, which names ItemRegistry - so a
# class here that extends BulletZone would fail to compile the whole tool.
const PARTS := """
const StatusEffects := preload("res://src/characters/statuseffects.gd")


# The zone with its hits tagged: everything it lands this frame is an orb.
class TaggedZone extends BulletZone:
	var stand: Node = null
	func _process(delta: float) -> void:
		if stand != null:
			stand.set("tag", "orb")
		super._process(delta)
		if stand != null:
			stand.set("tag", "")


# The effects with their burn ticks tagged.
class TaggedEffects extends "res://src/characters/statuseffects.gd":
	func advance(delta: float) -> void:
		if host != null:
			host.set("tag", "burn")
		super.advance(delta)
		if host != null:
			host.set("tag", "")


class StandIn extends CharacterBody2D:
	var hits: Array = []
	var tag: String = ""
	var is_dying: bool = false
	var dodging: bool = false
	var home: Vector2 = Vector2.ZERO
	var boss: Node2D = null
	var zone: BulletZone = null
	var effects_root: Node = null
	var _goal: Vector2 = Vector2.ZERO
	var _think: int = 0

	func take_damage(amount: int, element: int = 0) -> void:
		hits.append([int(amount), int(element), tag])

	func _physics_process(delta: float) -> void:
		var fx: Node = StatusEffects.of(self)
		var walk: float = 90.0 * (float(fx.call(&"speed_scale")) if fx != null else 1.0)
		var push: Vector2 = fx.call(&"push_velocity") if fx != null else Vector2.ZERO
		var goal: Vector2 = home
		if dodging:
			_think -= 1
			if _think <= 0:
				_think = 2
				_goal = _safest(walk)
			goal = _goal
		var step: Vector2 = (goal - global_position).limit_length(walk * delta)
		global_position += step + push * delta

	# --- the dodge ---------------------------------------------------------
	func _safest(walk: float) -> Vector2:
		var here: Vector2 = global_position
		var best: Vector2 = here
		var best_score: float = _danger(here)
		if walk <= 0.0 or best_score <= 0.0001 and absf(here.distance_to(boss.global_position) - 90.0) < 12.0:
			return best
		for ring in [10.0, 22.0, 38.0]:
			for k in 16:
				var at: Vector2 = here + Vector2.from_angle(TAU * k / 16.0) * ring
				var score: float = _danger(at) + ring * 0.004
				if score < best_score:
					best_score = score
					best = at
		return best

	func _danger(at: Vector2) -> float:
		var d: float = 0.0
		var from_boss: float = at.distance_to(boss.global_position)
		# Where a player wants to be: near range, in the room.
		d += absf(from_boss - 90.0) * 0.01
		if from_boss > 200.0:
			d += 5.0
		# The swing.
		if from_boss < 48.0:
			d += 40.0
		for node in effects_root.get_children():
			if not is_instance_valid(node):
				continue
			if "telegraph_seconds" in node and "ring_radius" in node:
				if bool(node.get("_spent")):
					continue
				var r: float = float(node.get("ring_radius")) * absf((node as Node2D).global_scale.x) + 9.0
				if at.distance_to((node as Node2D).global_position) < r:
					var left: float = float(node.get("telegraph_seconds")) - float(node.get("_telegraph_age"))
					d += 60.0 + 60.0 / maxf(left + 0.05, 0.05)
			elif node.is_in_group(&"acidpuddles"):
				if at.distance_to((node as Node2D).global_position) < 11.25 * absf((node as Node2D).global_scale.x) + 8.0:
					d += 15.0
		if zone != null:
			var field: BulletField = zone.field
			for i in field.count:
				var p: Vector2 = field.position_of(i)
				if p.distance_squared_to(at) > 140.0 * 140.0:
					continue
				var v: Vector2 = field.velocity_of(i)
				var brake: float = field.brake_of(i)
				var reach: float = field.radius_of(i) + BulletZone.HITBOX_RADIUS + 3.0
				for t in [0.0, 0.15, 0.3, 0.5]:
					var go: float = v.length() * t
					if brake > 0.0 and v.length() > 0.0:
						go = minf(go - 0.5 * brake * t * t, v.length_squared() / (2.0 * brake))
					var future: Vector2 = p + (v.normalized() * go if v.length() > 0.0 else Vector2.ZERO)
					if future.distance_to(at) < reach:
						d += 30.0 / (t + 0.2)
						break
			for lob in zone.get_children():
				if lob is BulletLob:
					var crater: float = float(lob.get("crater")) + 14.0
					if at.distance_to(lob.get("to")) < crater:
						d += 40.0
		return d
"""


class Pin extends Node:
	# Runs after the boss each physics frame and puts it back: the boss attacks
	# as it would, but never walks onto the stand-in or away from its hazards.
	var boss: Node2D
	var at: Vector2
	func _physics_process(_delta: float) -> void:
		if is_instance_valid(boss):
			boss.global_position = at
			if "velocity" in boss:
				boss.velocity = Vector2.ZERO


var seconds: float = 120.0
var only: String = ""
var _parts: Dictionary = {}
var _effects: GDScript = null
var _zones: GDScript = null


func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("seconds="):
			seconds = float(arg.trim_prefix("seconds="))
		elif arg.begins_with("only="):
			only = arg.trim_prefix("only=")
	_run.call_deferred()


func _run() -> void:
	await process_frame
	var parts := GDScript.new()
	parts.source_code = PARTS
	parts.reload()
	_parts = parts.get_script_constant_map()
	_effects = load("res://src/characters/statuseffects.gd")
	_zones = load("res://src/world/bulletzone.gd")
	for spec in BOSSES:
		if only != "" and not only.split(",").has(spec[0]):
			continue
		for stance in STANCES:
			for phase in range(3):
				var row: Dictionary = await _measure(spec[0], spec[1], stance[0], float(stance[1]), phase)
				print("BOSSMEASURE ", JSON.stringify(row))
	quit(0)


func _measure(id: String, path: String, stance: String, distance: float, phase: int) -> Dictionary:
	var world := Node2D.new()
	world.name = "measureworld"
	root.add_child(world)
	# Floating numbers and anything else parented to "the scene" need one.
	current_scene = world
	var effects := Node2D.new()
	effects.add_to_group(&"groundeffects")
	world.add_child(effects)

	var stand = (_parts["StandIn"] as GDScript).new()
	stand.add_to_group(&"player")
	stand.collision_layer = 4
	stand.collision_mask = 0
	var shape := CollisionShape2D.new()
	shape.name = "bodyshape"
	var circle := CircleShape2D.new()
	circle.radius = 8.0
	shape.shape = circle
	stand.add_child(shape)
	world.add_child(stand)
	stand.global_position = Vector2(distance, 0.0)
	stand.home = stand.global_position
	stand.dodging = stance == "dodge"
	stand.effects_root = effects
	var fx = (_parts["TaggedEffects"] as GDScript).new()
	fx.name = _effects.NODE_NAME
	fx.host = stand
	stand.add_child(fx)

	# THE ROOM'S ZONE, as boss.gd gives both boss rooms one.
	var zone = (_parts["TaggedZone"] as GDScript).new()
	zone.element_effects = true
	zone.stand = stand
	world.add_child(zone)
	stand.zone = zone

	var boss: Node2D = (load(path) as PackedScene).instantiate()
	boss.position = Vector2.ZERO
	world.add_child(boss)
	stand.boss = boss
	var pin := Pin.new()
	pin.boss = boss
	pin.at = Vector2.ZERO
	pin.process_physics_priority = 1000
	world.add_child(pin)

	var spawned: Dictionary = {}
	var puddles: Dictionary = {}
	effects.child_entered_tree.connect(func(n: Node) -> void:
		var key: String = n.scene_file_path.get_file().get_basename() if n.scene_file_path != "" else \
			(str(n.get_script().resource_path.get_file().get_basename()) if n.get_script() != null else n.get_class())
		spawned[key] = int(spawned.get(key, 0)) + 1
		if key.ends_with("puddle") and not puddles.has(key):
			puddles[key] = {"tick": n.get("tick_damage"), "lifetime": n.get("lifetime"),
				"interval": n.get("tick_interval"), "status": str(n.get("status"))})

	await physics_frame
	await physics_frame
	var max_hp: int = int(boss.get("max_hp"))
	boss.set("hp", int(round(max_hp * PHASE_HEALTH[phase])))
	var melee: int = int(boss.call("melee_damage"))
	var trail: int = int(boss.call("trail_damage"))
	var spike_raw: int = int(boss.call("spike_damage"))

	stand.hits.clear()
	fx.started.clear()
	var orbs_fired: int = 0
	var last_count: int = 0
	for i in range(int(seconds * TICKS)):
		await physics_frame
		# Held in its phase: nothing the stand-in does hurts it, but be sure.
		if int(boss.get("hp")) != int(round(max_hp * PHASE_HEALTH[phase])):
			boss.set("hp", int(round(max_hp * PHASE_HEALTH[phase])))
		var now: int = zone.field.count
		if now > last_count:
			orbs_fired += now - last_count
		last_count = now

	var by_amount: Dictionary = {}
	var orbs: Dictionary = {}
	var burns: Dictionary = {}
	for h in stand.hits:
		var into: Dictionary = by_amount
		if h[2] == "orb":
			into = orbs
		elif h[2] == "burn":
			into = burns
		into[str(h[0])] = int(into.get(str(h[0]), 0)) + 1
	var started: Dictionary = {}
	for kind in fx.started:
		started[str(kind)] = int(started.get(str(kind), 0)) + 1
	var element: int = int(boss.call("current_element"))

	# The element profile scales the spike and the trail (bossprojectile.gd),
	# so a stalker's pillar lands at the profiled size, not trail_damage().
	var profile: Dictionary = (load("res://src/projectiles/bossprojectile.gd") as GDScript) \
		.get_script_constant_map()["ELEMENT_PROFILE"]
	var factor: float = float((profile.get(element, profile[0]) as Dictionary)["damage"])
	var row := {"boss": id, "stance": stance, "phase": phase, "seconds": seconds,
		"max_hp": max_hp, "element": element, "spike_raw": spike_raw, "melee": melee,
		"trail": maxi(1, int(round(trail * factor))), "spike": maxi(1, int(round(spike_raw * factor))),
		"orb": _zones.share_of(spike_raw,
			float((boss.get_script() as GDScript).get_script_constant_map()["ORB_SHARE"])),
		"factor": factor, "effect": str(_effects.for_element(element)),
		"hits": by_amount, "orbs": orbs, "burns": burns, "effects": started,
		"orbs_fired": orbs_fired, "spawned": spawned, "puddles": puddles,
		"total": stand.hits.reduce(func(a, h): return a + int(h[0]), 0)}
	world.queue_free()
	await process_frame
	await process_frame
	return row
