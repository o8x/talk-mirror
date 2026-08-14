//go:build !windows

package service

import "context"

// IsService is always false on non-Windows platforms.
func IsService() bool { return false }

// Run executes run directly, forwarding the context unchanged.
func Run(_ string, run func(ctx context.Context) error) error {
	return run(context.Background())
}
