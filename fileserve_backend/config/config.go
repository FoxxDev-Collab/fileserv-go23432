package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Port        int
	DataDir     string
	StorageFile string
	JWTSecret   string
	TLSCert     string
	TLSKey      string
	UsePAM      bool
	AdminGroups []string
}

func Load() *Config {
	cfg := &Config{
		Port:        getEnvInt("PORT", 443),
		DataDir:     getEnv("DATA_DIR", "./data"),
		JWTSecret:   getEnv("JWT_SECRET", "change-me-in-production"),
		TLSCert:     getEnv("TLS_CERT", "./certs/cert.pem"),
		TLSKey:      getEnv("TLS_KEY", "./certs/key.pem"),
		UsePAM:      getEnvBool("USE_PAM", true),
		AdminGroups: getEnvList("ADMIN_GROUPS", []string{"wheel", "sudo", "admin", "root"}),
	}

	// Ensure data directory exists
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		panic("Failed to create data directory: " + err.Error())
	}

	// Storage file location
	cfg.StorageFile = filepath.Join(cfg.DataDir, "storage.json")

	return cfg
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}

func getEnvList(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		return strings.Split(value, ",")
	}
	return defaultValue
}
