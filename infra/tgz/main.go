package main

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"net/http"
)

const CURRENT = ".current"

type bundlePackage struct {
	sync.Mutex
	list         []string
	originalList []string
}

var state bundlePackage
var STORAGE string

func downloadTgz(url string) error {
	currentURL, err := os.ReadFile(filepath.Join(STORAGE, CURRENT))
	if err == nil && string(currentURL) == url {
		log.Printf("already downloaded: %s", url)
		return nil
	}

	log.Println("preparing")
	err = removeAllFiles()
	if err != nil {
		return err
	}

	log.Printf("downloading %s", url)

	remote, err := http.Get(url)
	if err != nil {
		return err
	}
	defer remote.Body.Close()

	if remote.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", remote.Status)
	}

	gzReader, err := gzip.NewReader(remote.Body)
	if err != nil {
		return err
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if header.Typeflag != tar.TypeReg {
			continue
		}

		filename := filepath.Base(header.Name)
		if strings.HasPrefix(filename, "hospitalInformation") {
			filename = "hospitalInformation.json"
		} else if strings.HasPrefix(filename, "practitionerInformation") {
			filename = "practitionerInformation.json"
		}
		if err := saveToFile(filename, tarReader); err != nil {
			return err
		}
	}

	if err := saveCurrent(url); err != nil {
		return err
	}

	log.Println("download completed")

	return nil
}

func handler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/healthz" {
		if _, err := os.Stat(filepath.Join(STORAGE, CURRENT)); err != nil {
			http.Error(w, http.StatusText(http.StatusInsufficientStorage), 507)
		}
		return
	}

	if r.URL.Path == "/reset" {
		state.reset()
		w.WriteHeader(http.StatusNoContent)
		return
	}

	state.serve(w, r)
}

func main() {
	if len(os.Args) < 2 {
		log.Fatal("provide the .tar.gz url to download")
	}

	var err error
	STORAGE, err = os.Getwd()
	if err != nil {
		log.Fatal(err)
	}

	if err := state.init(os.Args[1]); err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/", handler)
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func removeAllFiles() error {
	d, err := os.Open(STORAGE)
	if err != nil {
		return err
	}
	defer d.Close()
	names, err := d.Readdirnames(-1)
	if err != nil {
		return err
	}
	for _, name := range names {
		err = os.RemoveAll(filepath.Join(STORAGE, name))
		if err != nil {
			return err
		}
	}
	return nil
}

func saveCurrent(url string) error {
	return os.WriteFile(filepath.Join(STORAGE, CURRENT), []byte(url), 0666)
}

func saveToFile(filename string, content io.Reader) error {
	file, err := os.Create(filepath.Join(STORAGE, filename))
	if err != nil {
		return err
	}
	defer file.Close()

	gz := gzip.NewWriter(file)
	defer gz.Close()

	_, err = io.Copy(gz, content)
	return err
}

func (s *bundlePackage) init(url string) error {
	if err := downloadTgz(url); err != nil {
		return err
	}

	files, err := os.ReadDir(STORAGE)
	if err != nil {
		return err
	}

	for _, file := range files {
		if file.Name() != CURRENT && file.Name() != "hospitalInformation.json" && file.Name() != "practitionerInformation.json" {
			s.originalList = append(s.originalList, file.Name())
		}
	}
	s.list = s.originalList[:len(s.originalList)-1]

	return nil
}

func (s *bundlePackage) nextFile() string {
	s.Lock()
	defer s.Unlock()

	if len(s.list) == 0 {
		s.list = s.originalList[:len(s.originalList)-1]
	}
	file := s.list[0]
	s.list = s.list[1:]

	return file
}

// reset rewinds the rotation cursor so the next caller starts from the first
// bundle again. Used by import-test setup() to give every FHIR server the
// same dataset in the same order.
func (s *bundlePackage) reset() {
	s.Lock()
	defer s.Unlock()
	s.list = s.originalList[:len(s.originalList)-1]
	log.Println("cursor reset")
}

func (s *bundlePackage) serve(w http.ResponseWriter, r *http.Request) {
	filename := filepath.Base(r.URL.Path)

	if filename != "hospitalInformation.json" && filename != "practitionerInformation.json" {
		filename = s.nextFile()
	}

	log.Printf("serving %s", filename)

	file, err := os.Open(filepath.Join(STORAGE, filename))
	if err != nil {
		log.Println(err)
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Encoding", "gzip")
	_, _ = io.Copy(w, file)
}
