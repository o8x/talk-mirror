package main

import (
	"embed"
)

// viewsFS embeds the built frontend (views/dist).
//
//go:embed all:views/dist
var viewsFS embed.FS
