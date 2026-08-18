// occt-import-js ships no type definitions (0.0.23). These mirror the result
// shape documented in the package README.

declare module 'occt-import-js' {
  export interface OcctTriangulationParams {
    linearUnit?: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot'
    linearDeflectionType?: 'bounding_box_ratio' | 'absolute_value'
    linearDeflection?: number
    angularDeflection?: number
  }

  export interface OcctBrepFace {
    first: number
    last: number
    color: [number, number, number] | null
  }

  export interface OcctMesh {
    name: string
    color?: [number, number, number]
    brep_faces: OcctBrepFace[]
    attributes: {
      position: { array: number[] }
      normal?: { array: number[] }
    }
    index: { array: number[] }
  }

  export interface OcctNode {
    name: string
    meshes: number[]
    children: OcctNode[]
  }

  export interface OcctResult {
    success: boolean
    root: OcctNode
    meshes: OcctMesh[]
  }

  export interface Occt {
    ReadStepFile(content: Uint8Array, params: OcctTriangulationParams | null): OcctResult
    ReadIgesFile(content: Uint8Array, params: OcctTriangulationParams | null): OcctResult
    ReadBrepFile(content: Uint8Array, params: OcctTriangulationParams | null): OcctResult
  }

  export interface OcctModuleOptions {
    locateFile?: (path: string, prefix: string) => string
  }

  export default function occtimportjs(options?: OcctModuleOptions): Promise<Occt>
}
