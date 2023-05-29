const bcrypt = require("bcrypt");
const passport = require("passport");
const { Strategy: LocalStrategy } = require("passport-local");
const express = require("express");
const router = express.Router();
const mysql = require("mysql2");
const connection = require("../models/db");

passport.serializeUser((user, done) => {
  done(null, user.email);
});

passport.deserializeUser((email, done) => {
  connection.query(
    "SELECT * FROM user WHERE email = ?",
    [email],
    function (err, results) {
      if (err) {
        return done(err);
      }

      if (results.length === 0) {
        return done(null, false, { message: "No user with this email." });
      }

      const user = results[0];
      done(null, user);
    }
  );
});
