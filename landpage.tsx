import React, { Suspense, useRef } from 'react';
import { Canvas, useLoader, useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

// Optional: A component to animate the model
function Model({ modelPath }: { modelPath: string }) {
  const gltf = useLoader(GLTFLoader, modelPath);
  const ref = useRef<THREE.Group>(null);

  // You can add animations here if your model has them, or simple rotation
  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.005; // Simple continuous rotation
    }
  });

  return <primitive object={gltf.scene} scale={1} ref={ref} />; // Adjust scale as needed
}

const NeuroGuessrLandingPage: React.FC = () => {
  const modelPath = '/your_model.gltf'; // IMPORTANT: Adjust this path to your GLTF model

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{
        padding: '20px',
        backgroundColor: '#1a1a1a',
        color: 'white',
        fontSize: '2em',
        fontWeight: 'bold',
        borderBottom: '1px solid #333',
        zIndex: 10, // Ensure header is above the model if overlapping
      }}>
        NeuroGuessr
      </header>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flexGrow: 1 }}>
        {/* Left Half - 3D Model */}
        <div style={{ flex: 1, backgroundColor: '#282c34', position: 'relative' }}>
          <Canvas
            camera={{ position: [0, 0, 5], fov: 75 }} // Adjust camera position and FOV
            shadows // Enable shadows if your model and scene support them
          >
            <Suspense fallback={null}>
              <ambientLight intensity={0.5} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} castShadow />
              <pointLight position={[-10, -10, -10]} />

              {/* Environment for better lighting and reflections */}
              <Environment preset="city" /> {/* You can try different presets like "sunset", "dawn", "night", "warehouse", "forest", "studio", "luxury", "lobby", "draco" */}

              <Model modelPath={modelPath} />

              <OrbitControls /> {/* Allows user to rotate and zoom the model */}
            </Suspense>
          </Canvas>
        </div>

        {/* Right Half - Placeholder for other content */}
        <div style={{ flex: 1, backgroundColor: '#3c3f47', color: 'white', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div>
            <h1>Welcome to NeuroGuessr!</h1>
            <p>This is where you can add more information about your application.</p>
            <p>Explore the fascinating world of neuroscience through interactive experiences.</p>
            {/* Add more content here, buttons, descriptions, etc. */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NeuroGuessrLandingPage;