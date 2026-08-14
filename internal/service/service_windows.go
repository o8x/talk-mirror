//go:build windows

package service

import (
	"context"

	"golang.org/x/sys/windows/svc"
)

// IsService reports whether the process was started by the Windows Service
// Control Manager.
func IsService() bool {
	is, _ := svc.IsWindowsService()
	return is
}

// Run runs the given function as a Windows service. The supplied context is
// cancelled when the SCM requests a stop, allowing run to shut down cleanly.
func Run(name string, run func(ctx context.Context) error) error {
	return svc.Run(name, &handler{run: run})
}

type handler struct {
	run func(ctx context.Context) error
}

func (h *handler) Execute(_ []string, req <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	const accepted = svc.AcceptStop | svc.AcceptShutdown

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() { errCh <- h.run(ctx) }()

	changes <- svc.Status{State: svc.StartPending}
	changes <- svc.Status{State: svc.Running, Accepts: accepted}

	for {
		select {
		case c := <-req:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				changes <- svc.Status{State: svc.StopPending}
				cancel()
				<-errCh
				return false, 0
			}
		case err := <-errCh:
			if err != nil {
				return false, 1
			}
			return false, 0
		}
	}
}
