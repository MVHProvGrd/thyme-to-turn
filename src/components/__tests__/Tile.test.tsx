import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Tile, { shortLabel } from '../Tile'

/**
 * The chip must never make her read a label twice: state is in the accessible name and in
 * a mark (✓ / strikethrough), never colour alone.
 */
describe('Tile', () => {
  it('announces its state in the accessible name', () => {
    const { rerender } = render(<Tile name="parmesan" state="unknown" onTap={() => {}} />)
    expect(screen.getByRole('button', { name: 'parmesan, not marked' })).toBeInTheDocument()
    rerender(<Tile name="parmesan" state="dontHave" onTap={() => {}} />)
    expect(screen.getByRole('button', { name: 'parmesan, ruled out' })).toBeInTheDocument()
    rerender(<Tile name="parmesan" state="have" onTap={() => {}} />)
    expect(screen.getByRole('button', { name: 'parmesan, have' })).toBeInTheDocument()
  })

  it('carries a ✓ only when she has it, and a strikethrough only when she is out', () => {
    const { rerender, container } = render(<Tile name="onion" state="have" onTap={() => {}} />)
    expect(container.textContent).toContain('✓')
    expect(container.querySelector('button')?.className).not.toContain('line-through')
    rerender(<Tile name="onion" state="dontHave" onTap={() => {}} />)
    expect(container.textContent).not.toContain('✓')
    expect(container.querySelector('button')?.className).toContain('line-through')
    rerender(<Tile name="onion" state="unknown" onTap={() => {}} />)
    expect(container.textContent).not.toContain('✓')
    expect(container.querySelector('button')?.className).not.toContain('line-through')
  })

  it('leads with an emoji when given one, and never invents one', () => {
    const { container } = render(<Tile name="onion" state="unknown" emoji="🧅" onTap={() => {}} />)
    expect(container.textContent).toBe('🧅onion')
  })

  it('shortens long labels but keeps the full name for the screen reader', () => {
    expect(shortLabel('crème fraîche')).toBe('crème fraîche')
    expect(shortLabel('flat-leaf parsley')).toBe('flat-leaf par…')
    render(<Tile name="flat-leaf parsley" state="unknown" onTap={() => {}} />)
    expect(screen.getByRole('button', { name: 'flat-leaf parsley, not marked' })).toBeInTheDocument()
  })

  it('reports a tap and nothing else — the screen decides what the tap means', () => {
    const onTap = vi.fn()
    render(<Tile name="garlic" state="unknown" onTap={onTap} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('takes an accessible-name override for Settings, where "ruled out" would be wrong', () => {
    render(<Tile name="salt" state="have" ariaLabel="salt, a staple" onTap={() => {}} />)
    expect(screen.getByRole('button', { name: 'salt, a staple' })).toBeInTheDocument()
  })
})
