// Floor datasets are large generated JSON files. They are typed as `unknown`
// on import (resolveJsonModule is off) and shaped by buildDataset().
declare module '*.json' {
  const value: unknown
  export default value
}
