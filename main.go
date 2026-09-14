package main

import (
	"log"
	"net/http"
)

func main() {
	addr := "localhost:8080"
	http.Handle("/", http.FileServer(http.Dir(".")))
	log.Printf("MIDI Piano running at http://%s (use Chrome or Edge for Web MIDI support)", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
