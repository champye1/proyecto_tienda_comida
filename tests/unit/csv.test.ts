/**
 * Exportación a Excel (src/lib/csv.ts): formato para Excel en español y, sobre todo,
 * protección contra inyección de fórmulas ("CSV injection") en datos que escriben clientes.
 */
import { describe, expect, it } from 'vitest'
import { toCsv } from '@/lib/csv'

describe('toCsv', () => {
  const out = toCsv(
    ['Nombre', 'Nota', 'Total'],
    [
      ['=HYPERLINK("http://malo.cl","clic")', 'normal; con punto y coma', 12990],
      ['+56 9 1234', '@SUM(A1)', -5],
      ['Ñandú "el rápido"', 'línea1\nlínea2', null],
      ['-2+3', '\tcmd', true],
    ],
  )

  it('empieza con BOM UTF-8 y usa ";" (Excel en español)', () => {
    expect(out.startsWith('﻿Nombre;Nota;Total\r\n')).toBe(true)
  })

  it('neutraliza celdas que Excel ejecutaría como fórmula (= + - @ tab)', () => {
    expect(out).toContain(`"'=HYPERLINK(""http://malo.cl"",""clic"")"`)
    expect(out).toContain("'+56 9 1234")
    expect(out).toContain("'@SUM(A1)")
    expect(out).toContain("'-2+3")
    expect(out).toContain("'\tcmd")
  })

  it('no altera los números (para poder sumarlos)', () => {
    expect(out).toContain(';12990\r\n')
    expect(out).toContain(';-5\r\n')
  })

  it('escapa ";", comillas y saltos de línea; vacío para null', () => {
    expect(out).toContain('"normal; con punto y coma"')
    expect(out).toContain('"Ñandú ""el rápido"""')
    expect(out).toContain('"línea1\nlínea2";\r\n')
  })
})
