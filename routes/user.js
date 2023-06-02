const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const path = require("path");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const { hashPassword } = require("mysql/lib/protocol/Auth");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");
const cookieParser = require("cookie-parser");

const connection = mysql.createConnection({
  host: "127.0.0.1",
  user: "ahn",
  password: "Yongin@0322",
  database: "aiservicelab",
});

//연결 오류시 에러메시지 출력
connection.connect((err) => {
  if (err) {
    console.error("데이터 베이스와 연결에 실패했습니다." + err.stack);
    return;
  }
  console.log("데이터 베이스 연결 완료");
});

module.exports = connection;
router.use(cookieParser());

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  return  res.status(200);
}

// 로그인이 되어 있는 상태에서 로그인 또는 회원 가입 페이지에 접근하는 경우 사용
function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.status(200);
  }
  return next();
}

router.get("/findemail", checkNotAuthenticated, (req, res) => {
  res.status(200);
});

router.get("/findpwd", checkNotAuthenticated, (req, res) => {
  res.status(200);
});

router.get("/changepwd", checkNotAuthenticated, (req, res) => {
  res.status(200);
});

router.post("/findemail", (req, res) => {
  const { name, question, answer } = req.body;

  // 입력 데이터 확인
  if (!name || !question || !answer) {
    return res.status(400);
  }

  const query =
    "SELECT email FROM user WHERE name = ? AND question = ? AND answer = ?";

  const params = [name, question, answer];

  connection.query(query, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500);
    }

    if (results.length === 0) {
      return res
        .status(401);
    } else {
      return res
        .status(200);
    }
  });
});

router.post("/findpwd", (req, res) => {
  const { name, email, question, answer } = req.body;

  // 입력 데이터 확인
  if (!name || !email || !question || !answer) {
    return res.status(400);
  }

  connection.query(
    "SELECT * FROM user WHERE name = ? AND email = ? AND question = ? AND answer = ?",
    [name, email, question, answer],
    function (err, results) {
      if (err) {
        console.error(err);
        return res.status(500);
      }

      if (results.length === 0) {
        return res
          .status(401);
      }

      // 해당 정보와 일치하는 사용자가 있을 경우, changepwd 페이지로 이동
      res.status(200);

    }
  );
});

router.post("/changepwd", (req, res) => {
  const { email, newPwd } = req.body;

  // 입력된 새 비밀번호가 없는 경우 에러 메시지를 반환합니다.
  if (!newPwd || !email) {
    return res.status(400);
  }

  // 기존 비밀번호를 데이터베이스에서 가져옵니다.
  connection.query(
    "SELECT pwd FROM user WHERE email = ?",
    [email],
    function (err, results) {
      if (err) {
        console.error(err);
        return res.status(500);
      }

      if (results.length === 0) {
        return res.status(401);
      }

      // 가져온 기존 비밀번호를 암호화된 형태로 저장합니다.
      const oldPwd = results[0].pwd;

      // bcrypt.compare를 이용해 새 비밀번호와 기존 비밀번호를 비교합니다.
      bcrypt.compare(newPwd, oldPwd, function (err, isMatch) {
        if (err) {
          console.error(err);
          return res.status(500);
        }

        // 만약 새 비밀번호와 기존 비밀번호가 같다면 에러 메시지를 반환합니다.
        if (isMatch) {
          return res
            .status(400);
        }

        // 새 비밀번호를 암호화합니다.
        bcrypt.hash(newPwd, 10, (err, hashedPwd) => {
          if (err) {
            console.error(err);
            return res
              .status(500);
          }

          // 데이터베이스에 새 비밀번호를 저장합니다.
          connection.query(
            "UPDATE user SET pwd = ? WHERE email = ?",
            [hashedPwd, email],
            (err, result) => {
              if (err) {
                console.error(err);
                return res
                  .status(500);
              } else {
                res.status(200);
              }
            }
          );
        });
      });
    }
  );
});

module.exports = router;
