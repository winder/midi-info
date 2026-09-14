package main

import (
	"embed"
	"log"
	"net/http"
)

//go:embed index.html
var staticFiles embed.FS

func main() {
	addr := "localhost:8080"
	http.Handle("/", http.FileServer(http.FS(staticFiles)))
	log.Printf("MIDI Piano running at http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
