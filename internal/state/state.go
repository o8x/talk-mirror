package state

import "sync/atomic"

// Gate controls whether the system is paused (not receiving data).
type Gate struct {
	paused atomic.Bool
}

func (g *Gate) Pause()  { g.paused.Store(true) }
func (g *Gate) Resume() { g.paused.Store(false) }
func (g *Gate) Paused() bool { return g.paused.Load() }
