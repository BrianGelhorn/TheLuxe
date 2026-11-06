import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

// This module is deliberately independent of the financial state and can be
// included in ordinary SQLite backups. Never store passwords or codes in clear.
const hashCode = code => createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
const derive = (password, salt) => scryptSync(password, salt, 32);
const validPassword = password => typeof password === 'string' && password.length >= 8 && password.length <= 256;

export function createAccessControl(db) {
  db.exec('CREATE TABLE IF NOT EXISTS access_credentials (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, password_hash TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS access_recovery_codes (hash TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0)');
  const current = () => db.prepare('SELECT salt,password_hash FROM access_credentials WHERE id=1').get();
  const verify = password => {
    const saved = current();
    if (!saved || typeof password !== 'string' || password.length > 256) return false;
    const actual = derive(password, saved.salt);
    const expected = Buffer.from(saved.password_hash, 'hex');
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  };
  const updatePassword = password => {
    const salt = randomBytes(16).toString('hex');
    const digest = derive(password, salt).toString('hex');
    db.prepare('INSERT INTO access_credentials VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash').run(salt, digest);
  };
  return {
    configured: () => Boolean(current()),
    verify,
    setup(password, hashes) {
      if (!validPassword(password) || !Array.isArray(hashes) || hashes.length < 1 || hashes.length > 100 || hashes.some(hash => !/^[a-f0-9]{64}$/.test(hash)) || new Set(hashes).size !== hashes.length) throw new Error('Datos de acceso inválidos');
      db.exec('BEGIN IMMEDIATE');
      try {
        if (current()) throw new Error('La contraseña ya está configurada');
        updatePassword(password);
        const insert = db.prepare('INSERT INTO access_recovery_codes(hash) VALUES (?)');
        for (const hash of hashes) insert.run(hash);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    change(password, credential) {
      if (!validPassword(password) || typeof credential !== 'string' || credential.length > 256) throw new Error('Datos de acceso inválidos');
      db.exec('BEGIN IMMEDIATE');
      try {
        if (!current()) throw new Error('No hay contraseña configurada');
        if (!verify(credential)) {
          const code = db.prepare('UPDATE access_recovery_codes SET used=1 WHERE hash=? AND used=0').run(hashCode(credential));
          if (code.changes !== 1) throw new Error('Contraseña o código incorrecto');
        }
        updatePassword(password);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}

export { hashCode };
