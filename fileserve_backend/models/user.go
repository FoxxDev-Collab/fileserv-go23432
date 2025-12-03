package models

import (
	"time"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID                string    `json:"id"`
	Username          string    `json:"username"`
	PasswordHash      string    `json:"password_hash"`
	Email             string    `json:"email,omitempty"`
	IsAdmin           bool      `json:"is_admin"`
	Groups            []string  `json:"groups"`
	MustChangePassword bool     `json:"must_change_password"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (u *User) SetPassword(password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.PasswordHash = string(hash)
	return nil
}

func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	return err == nil
}

// SafeUser returns a user object without sensitive information
type SafeUser struct {
	ID                string    `json:"id"`
	Username          string    `json:"username"`
	Email             string    `json:"email,omitempty"`
	IsAdmin           bool      `json:"is_admin"`
	Groups            []string  `json:"groups"`
	MustChangePassword bool     `json:"must_change_password"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (u *User) Safe() SafeUser {
	return SafeUser{
		ID:                u.ID,
		Username:          u.Username,
		Email:             u.Email,
		IsAdmin:           u.IsAdmin,
		Groups:            u.Groups,
		MustChangePassword: u.MustChangePassword,
		CreatedAt:         u.CreatedAt,
		UpdatedAt:         u.UpdatedAt,
	}
}
