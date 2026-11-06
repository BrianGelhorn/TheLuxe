import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAccessControl, hashCode } from '../access-control.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('La contraseña cambia con la anterior o con un código que se consume una sola vez', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const access = createAccessControl(db);
    const code = 'TEST-ONLY-RECOVERY-CODE';
    access.setup('primera contraseña', [hashCode(code)]);
    assert.equal(access.verify('primera contraseña'), true);
    assert.throws(() => access.change('otra contraseña', 'incorrecta'));
    assert.equal(access.verify('primera contraseña'), true);
    access.change('segunda contraseña', 'primera contraseña');
    assert.equal(access.verify('primera contraseña'), false);
    access.change('tercera contraseña', code);
    assert.equal(access.verify('tercera contraseña'), true);
    assert.throws(() => access.change('cuarta contraseña', code));
    assert.equal(access.verify('tercera contraseña'), true);
    assert.throws(() => access.setup('cuarta contraseña', [hashCode('OTRO')]));
    assert.equal(db.prepare('SELECT used FROM access_recovery_codes').get().used, 1);
  } finally { db.close(); }
});

test('La contraseña y los códigos usados se conservan después de reiniciar', () => {
  const directory = mkdtempSync(join(tmpdir(), 'theluxe-access-'));
  try {
    const filename = join(directory, 'base.sqlite');
    let db = new DatabaseSync(filename);
    let access = createAccessControl(db);
    access.setup('clave anterior', [hashCode('RECOVERY-TEST')]);
    access.change('clave renovada', 'RECOVERY-TEST');
    db.close();
    db = new DatabaseSync(filename);
    access = createAccessControl(db);
    assert.equal(access.configured(), true);
    assert.equal(access.verify('clave renovada'), true);
    assert.throws(() => access.change('otra clave nueva', 'RECOVERY-TEST'));
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
