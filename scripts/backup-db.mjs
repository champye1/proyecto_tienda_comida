// Respaldo de la base de datos (roles, estructura y datos) con cifrado opcional.
//
// Por qué existe: Supabase hace respaldos diarios automáticos en los planes pagados, pero
// conviene tener además una copia PROPIA fuera de Supabase (si se borra el proyecto, se
// pierde el acceso a la cuenta o un error borra datos, los respaldos de Supabase no
// siempre alcanzan). Ver "Respaldos" en SECURITY.md para la estrategia completa.
//
// Uso:
//   npm run db:backup                        Respalda la base LOCAL (Docker)
//   npm run db:backup -- --remote            Respalda PRODUCCIÓN (requiere SUPABASE_DB_URL)
//   npm run db:backup -- --decrypt <carpeta> Descifra un respaldo para restaurarlo
//
// Variables de entorno (en .env.local o en la terminal; NUNCA en el repositorio):
//   SUPABASE_DB_URL     Cadena de conexión de producción (Dashboard → Connect → Session pooler).
//   BACKUP_PASSPHRASE   Contraseña para cifrar (mínimo 16 caracteres). Obligatoria con --remote:
//                       el respaldo contiene datos personales de clientes (nombres, teléfonos,
//                       direcciones), y sin cifrar quedaría expuesto si se pierde el equipo.
//   BACKUP_KEEP_DAYS    Días que se conservan los respaldos locales (por defecto 30). Los más
//                       antiguos se borran: así se cumple el plazo de la Política de privacidad.
//
// Resultado: backups/<fecha>/{roles,schema,data}.sql(.enc) + manifest.json con SHA-256.
// La carpeta backups/ está en .gitignore.

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BACKUP_ROOT = 'backups'
// CLI de Supabase del proyecto, ejecutado con node directo (sin shell: la cadena de
// conexión no pasa por un intérprete de comandos que pueda malinterpretar sus caracteres).
const SUPABASE_CLI = join('node_modules', 'supabase', 'dist', 'supabase.js')

// Formato del archivo cifrado: MAGIC | salt(16) | iv(12) | tag(16) | datos cifrados.
const MAGIC = Buffer.from('PDBK1')

const args = process.argv.slice(2)
const passphrase = process.env.BACKUP_PASSPHRASE ?? ''

/** Deriva la clave AES-256 desde la contraseña (scrypt: lento a propósito contra fuerza bruta). */
const deriveKey = (salt) => scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })

/** Cifra con AES-256-GCM, que además detecta si el archivo fue alterado. */
function encrypt(plain) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(salt), iv)
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data])
}

/** Descifra; falla si la contraseña es incorrecta o el archivo fue modificado. */
function decrypt(blob) {
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('No es un respaldo cifrado válido')
  let o = MAGIC.length
  const salt = blob.subarray(o, (o += 16))
  const iv = blob.subarray(o, (o += 12))
  const tag = blob.subarray(o, (o += 16))
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(salt), iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(blob.subarray(o)), decipher.final()])
  } catch {
    throw new Error('No se pudo descifrar: la contraseña es incorrecta o el archivo está dañado/alterado')
  }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** Ejecuta `supabase db dump` y devuelve el SQL generado. */
function dump(target, extra) {
  const r = spawnSync(process.execPath, [SUPABASE_CLI, 'db', 'dump', ...target, ...extra], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (r.status !== 0) {
    // stderr puede incluir la cadena de conexión: se oculta la contraseña antes de mostrarlo.
    const msg = r.stderr.toString().replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+@/g, '$1****@')
    throw new Error(`supabase db dump falló:\n${msg}`)
  }
  return r.stdout
}

/** Borra los respaldos más antiguos que BACKUP_KEEP_DAYS. */
function pruneOld() {
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 30)
  const limit = Date.now() - keepDays * 24 * 60 * 60 * 1000
  for (const name of readdirSync(BACKUP_ROOT)) {
    const dir = join(BACKUP_ROOT, name)
    if (statSync(dir).isDirectory() && statSync(dir).mtimeMs < limit) {
      rmSync(dir, { recursive: true, force: true })
      console.log(`  Borrado respaldo antiguo: ${dir}`)
    }
  }
}

// -----------------------------------------------------------------------------
// Modo descifrado: npm run db:backup -- --decrypt backups/<fecha>
// -----------------------------------------------------------------------------
if (args[0] === '--decrypt') {
  const dir = args[1]
  if (!dir || !existsSync(dir)) throw new Error('Indica la carpeta del respaldo: --decrypt backups/<fecha>')
  if (!passphrase) throw new Error('Falta BACKUP_PASSPHRASE para descifrar')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.enc'))) {
    writeFileSync(join(dir, file.replace(/\.enc$/, '')), decrypt(readFileSync(join(dir, file))))
    console.log(`  ✔ ${file} → ${file.replace(/\.enc$/, '')}`)
  }
  console.log('\nListo. Recuerda borrar los .sql descifrados al terminar la restauración (tienen datos personales).')
  process.exit(0)
}

// -----------------------------------------------------------------------------
// Modo respaldo
// -----------------------------------------------------------------------------
const remote = args.includes('--remote')
const dbUrl = process.env.SUPABASE_DB_URL
if (remote && !dbUrl) throw new Error('Falta SUPABASE_DB_URL (cadena de conexión de producción)')
if (remote && passphrase.length < 16) {
  throw new Error('Con --remote es obligatorio cifrar: define BACKUP_PASSPHRASE (mínimo 16 caracteres)')
}
if (passphrase && passphrase.length < 16) throw new Error('BACKUP_PASSPHRASE debe tener al menos 16 caracteres')

const target = remote ? ['--db-url', dbUrl] : ['--local']
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = join(BACKUP_ROOT, `${stamp}${remote ? '-prod' : '-local'}`)
mkdirSync(outDir, { recursive: true })

console.log(`Respaldando la base ${remote ? 'de PRODUCCIÓN' : 'local'} en ${outDir}…`)
// Las tres partes que recomienda Supabase para poder restaurar en un proyecto nuevo.
const parts = {
  'roles.sql': ['--role-only'],
  'schema.sql': [],
  'data.sql': ['--data-only', '--use-copy'],
}

const manifest = { created_at: new Date().toISOString(), source: remote ? 'remote' : 'local', encrypted: !!passphrase, files: {} }
for (const [name, extra] of Object.entries(parts)) {
  const sql = dump(target, extra)
  const out = passphrase ? encrypt(sql) : sql
  const file = passphrase ? `${name}.enc` : name
  writeFileSync(join(outDir, file), out)
  // El hash permite comprobar más adelante que el archivo no se dañó ni fue alterado.
  manifest.files[file] = { bytes: out.length, sha256: sha256(out) }
  console.log(`  ✔ ${file} (${(out.length / 1024).toFixed(1)} KB)`)
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

if (!passphrase) console.warn('\n⚠ Respaldo SIN cifrar. Define BACKUP_PASSPHRASE para cifrarlo.')
pruneOld()
console.log('\nRespaldo completo. Guarda una copia fuera de este equipo (p. ej. un disco externo o nube privada).')
