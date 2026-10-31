import { OrbitControls } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"

const TABLE_TOP_Y = 0.79
const LEG_POSITIONS = [
  [-1.8, -1.1],
  [1.8, -1.1],
  [-1.8, 1.1],
  [1.8, 1.1],
] as const

function Table() {
  return (
    <group>
      <mesh position={[0, TABLE_TOP_Y - 0.04, 0]} receiveShadow castShadow>
        <boxGeometry args={[4, 0.08, 2.5]} />
        <meshStandardMaterial color="#8b5a3c" />
      </mesh>
      {LEG_POSITIONS.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, (TABLE_TOP_Y - 0.08) / 2, z]} castShadow>
          <boxGeometry args={[0.1, TABLE_TOP_Y - 0.08, 0.1]} />
          <meshStandardMaterial color="#6b4430" />
        </mesh>
      ))}
    </group>
  )
}

function Bomb() {
  return (
    <group position={[0, TABLE_TOP_Y + 0.25, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.2, 0.5, 0.8]} />
        <meshStandardMaterial color="#3b4252" />
      </mesh>
      <mesh position={[0, 0.1, 0.41]}>
        <boxGeometry args={[0.5, 0.18, 0.02]} />
        <meshStandardMaterial color="#111" emissive="#e5484d" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

export function Scene() {
  return (
    <Canvas shadows camera={{ position: [2.5, 2.5, 3.5], fov: 45 }}>
      <color attach="background" args={["#1d2230"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 3]} intensity={1.6} castShadow />
      <Table />
      <Bomb />
      <OrbitControls target={[0, TABLE_TOP_Y, 0]} />
    </Canvas>
  )
}
