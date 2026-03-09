<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import Matter from 'matter-js'

const props = defineProps({
  letters: { type: Array, default: () => [] },
  active: { type: Boolean, default: false },
  frozen: { type: Boolean, default: false },
  convergeTarget: { type: Object, default: null }
})

const containerRef = ref(null)
const letterStates = reactive([])
const dyingLetters = reactive([])
const LETTER_SIZE = 32

let engine = null
let runner = null
let animFrameId = null
let bodies = []
let resizeObserver = null
let convergeFrameId = null

let frameSkip = 0
function syncPositions() {
  // Throttle: skip frames when many bodies to reduce reactive overhead
  frameSkip++
  const skip = bodies.length > 500 ? 3 : bodies.length > 200 ? 2 : 1
  if (frameSkip % skip !== 0) {
    animFrameId = requestAnimationFrame(syncPositions)
    return
  }

  const len = bodies.length
  for (let i = 0; i < len; i++) {
    const body = bodies[i]
    const state = letterStates[i]
    if (!state) continue
    // Only update if body moved meaningfully
    const dx = body.position.x - state.x
    const dy = body.position.y - state.y
    if (dx * dx + dy * dy > 0.25 || Math.abs(body.angle - state.angle) > 0.005) {
      state.x = body.position.x
      state.y = body.position.y
      state.angle = body.angle
    }
  }
  animFrameId = requestAnimationFrame(syncPositions)
}

function initEngine() {
  if (!containerRef.value) return false
  const width = containerRef.value.offsetWidth
  const height = containerRef.value.offsetHeight
  if (width === 0 || height === 0) return false

  engine = Matter.Engine.create({ gravity: { x: 0, y: 0.6 } })

  const t = 60
  Matter.Composite.add(engine.world, [
    Matter.Bodies.rectangle(width / 2, height + t / 2, width + 100, t, { isStatic: true }),
    Matter.Bodies.rectangle(-t / 2, height / 2, t, height * 2, { isStatic: true }),
    Matter.Bodies.rectangle(width + t / 2, height / 2, t, height * 2, { isStatic: true }),
  ])

  runner = Matter.Runner.create()
  Matter.Runner.run(runner, engine)
  animFrameId = requestAnimationFrame(syncPositions)
  return true
}

function addBody(char = '') {
  if (!engine || !containerRef.value) return
  const width = containerRef.value.offsetWidth
  const x = 40 + Math.random() * (width - 80)

  const body = Matter.Bodies.rectangle(x, -20, LETTER_SIZE, LETTER_SIZE, {
    chamfer: { radius: 6 },
    restitution: 0.4,
    friction: 0.3,
    density: 0.002,
  })
  Matter.Body.setAngle(body, (Math.random() - 0.5) * 0.6)
  Matter.Body.setVelocity(body, {
    x: (Math.random() - 0.5) * 2,
    y: Math.random() * 2
  })

  Matter.Composite.add(engine.world, body)
  bodies.push(body)
  letterStates.push({ x: body.position.x, y: body.position.y, angle: body.angle, char, scale: 1, opacity: 1 })
}

function removeLastBodies(count) {
  if (!engine) return
  for (let i = 0; i < count; i++) {
    if (bodies.length === 0) break
    const body = bodies.pop()
    const state = letterStates.pop()
    dyingLetters.push({
      id: Date.now() + Math.random(),
      char: state.char,
      x: body.position.x,
      y: body.position.y,
      angle: body.angle
    })
    Matter.Composite.remove(engine.world, body)
  }
}

function removeDyingLetter(id) {
  const idx = dyingLetters.findIndex(d => d.id === id)
  if (idx !== -1) dyingLetters.splice(idx, 1)
}

function cleanup() {
  if (convergeFrameId) { cancelAnimationFrame(convergeFrameId); convergeFrameId = null }
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  if (animFrameId) cancelAnimationFrame(animFrameId)
  if (runner) Matter.Runner.stop(runner)
  if (engine) Matter.Engine.clear(engine)
  animFrameId = null
  runner = null
  engine = null
  bodies = []
  letterStates.length = 0
  dyingLetters.length = 0
}

function startConverge(target) {
  if (convergeFrameId) { cancelAnimationFrame(convergeFrameId); convergeFrameId = null }
  let frame = 0
  function tick() {
    frame++
    let allDone = true
    letterStates.forEach((s, i) => {
      if (frame < i * 2) { allDone = false; return }
      s.x += (target.x - s.x) * 0.08
      s.y += (target.y - s.y) * 0.08
      s.angle *= 0.9
      s.scale = Math.max(0, s.scale - 0.02)
      s.opacity = Math.max(0, s.opacity - 0.018)
      if (s.scale > 0.01 || s.opacity > 0.01) allDone = false
    })
    if (!allDone) {
      convergeFrameId = requestAnimationFrame(tick)
    }
  }
  convergeFrameId = requestAnimationFrame(tick)
}

watch(() => props.convergeTarget, (target) => {
  if (target && props.frozen) {
    startConverge(target)
  } else {
    if (convergeFrameId) { cancelAnimationFrame(convergeFrameId); convergeFrameId = null }
  }
})

function startEngine() {
  if (!containerRef.value) return
  if (initEngine()) {
    props.letters.forEach((l) => addBody(l.char))
    return
  }
  resizeObserver = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect
    if (width > 0 && height > 0) {
      resizeObserver.disconnect()
      resizeObserver = null
      if (initEngine()) props.letters.forEach((l) => addBody(l.char))
    }
  })
  resizeObserver.observe(containerRef.value)
}

watch(() => props.letters.length, (newLen, oldLen) => {
  if (!props.active) return
  if (newLen > oldLen) {
    if (!engine) {
      if (!initEngine()) return
      props.letters.forEach((l) => addBody(l.char))
      return
    }
    for (let i = oldLen; i < newLen; i++) addBody(props.letters[i].char)
  } else if (newLen < oldLen) {
    removeLastBodies(oldLen - newLen)
  }
})

watch(() => props.frozen, (val) => {
  if (val) {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null }
    if (runner) Matter.Runner.stop(runner)
  } else if (props.active && engine) {
    runner = Matter.Runner.create()
    Matter.Runner.run(runner, engine)
    animFrameId = requestAnimationFrame(syncPositions)
  }
})

watch(() => props.active, async (val) => {
  if (val) { await nextTick(); cleanup(); startEngine() }
  else cleanup()
})

onMounted(() => { if (props.active) nextTick(() => startEngine()) })
onUnmounted(() => cleanup())
</script>

<template>
  <div ref="containerRef" class="falling-letters-container">
    <div
      v-for="(letter, i) in letters"
      :key="letter.id"
      class="falling-letter"
      :style="{
        transform: letterStates[i]
          ? `translate(${letterStates[i].x - LETTER_SIZE / 2}px, ${letterStates[i].y - LETTER_SIZE / 2}px) rotate(${letterStates[i].angle}rad) scale(${letterStates[i].scale})`
          : 'translate(-100px, -100px)',
        opacity: letterStates[i] ? letterStates[i].opacity : 1,
      }"
    >
      {{ letter.char }}
    </div>

    <div
      v-for="dying in dyingLetters"
      :key="'dying-' + dying.id"
      class="falling-letter dying-letter"
      :style="{
        transform: `translate(${dying.x - LETTER_SIZE / 2}px, ${dying.y - LETTER_SIZE / 2}px) rotate(${dying.angle}rad)`
      }"
      @animationend="removeDyingLetter(dying.id)"
    >
      {{ dying.char }}
    </div>
  </div>
</template>

<style scoped>
.falling-letters-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: visible;
  pointer-events: none;
  contain: layout style;
}

.falling-letter {
  position: absolute;
  top: 0;
  left: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--primary-brand, #005FB8);
  background: rgba(224, 236, 247, 0.7);
  border: 1.5px solid rgba(0, 95, 184, 0.2);
  border-radius: 8px;
  user-select: none;
  pointer-events: none;
  will-change: transform, opacity;
  contain: layout style paint;
}

.dying-letter {
  animation: letter-pop-out 0.5s ease-out forwards;
}

@keyframes letter-pop-out {
  0% {
    scale: 1;
    opacity: 1;
    translate: 0 0;
  }
  30% {
    scale: 1.4;
    opacity: 0.8;
    translate: 0 -20px;
  }
  100% {
    scale: 0.5;
    opacity: 0;
    translate: 0 -80px;
  }
}
</style>
