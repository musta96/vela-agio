import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Icosahedron, Points, PointMaterial, Stars } from "@react-three/drei";
import { useMemo, useRef, Suspense } from "react";
import * as THREE from "three";

function ParticleField() {
  const ref = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const arr = new Float32Array(2500 * 3);
    for (let i = 0; i < arr.length; i++) arr[i] = (Math.random() - 0.5) * 18;
    return arr;
  }, []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.04;
    ref.current.rotation.x += dt * 0.015;
  });
  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled>
      <PointMaterial transparent color="#378ADD" size={0.018} sizeAttenuation depthWrite={false} opacity={0.85} />
    </Points>
  );
}

function WireGlobe() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.18;
    ref.current.rotation.x += dt * 0.05;
  });
  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.8}>
      <Icosahedron ref={ref} args={[2.2, 4]}>
        <meshBasicMaterial color="#185FA5" wireframe transparent opacity={0.55} />
      </Icosahedron>
      <Icosahedron args={[2.35, 2]}>
        <meshBasicMaterial color="#1D9E75" wireframe transparent opacity={0.18} />
      </Icosahedron>
    </Float>
  );
}

export default function CinematicScene({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 ${className}`}>
      <Canvas
        dpr={[1, 1.6]}
        camera={{ position: [0, 0, 6], fov: 55 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight position={[5, 5, 5]} intensity={1.2} color="#378ADD" />
          <Stars radius={60} depth={40} count={1200} factor={3} fade speed={0.8} />
          <ParticleField />
          <WireGlobe />
        </Suspense>
      </Canvas>
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/10 to-background pointer-events-none" />
    </div>
  );
}