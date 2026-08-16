import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Home from '../Home'

describe('Home', () => {
  it('says the app name out loud', () => {
    render(<Home />)
    expect(screen.getByRole('heading', { name: 'Thyme to Turn' })).toBeInTheDocument()
  })
})
