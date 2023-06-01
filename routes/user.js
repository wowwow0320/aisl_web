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
function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  return  res.status(200).send("GET /login");
}

// 로그인이 되어 있는 상태에서 로그인 또는 회원 가입 페이지에 접근하는 경우 사용
function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.status(200).send("GET /main");
  }
  return next();
}

router.get("/findemail", checkNotAuthenticated, (req, res) => {
  res.status(200).send("GET /findemail");
});

router.get("/findpwd", checkNotAuthenticated, (req, res) => {
  res.status(200).send("GET /findpwd");
});

router.get("/changepwd", checkNotAuthenticated, (req, res) => {
  res.status(200).send("GET /changepwd");
});

router.post("/findemail", (req, res) => {
  const { name, question, answer } = req.body;

  // 입력 데이터 확인
  if (!name || !question || !answer) {
    return res.status(400).send("모든 필드를 입력해주세요.");
  }

  const query =
    "SELECT email FROM user WHERE name = ? AND question = ? AND answer = ?";

  const params = [name, question, answer];

  connection.query(query, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send("이메일 찾기 중 오류가 발생했습니다.");
    }

    if (results.length === 0) {
      return res
        .status(401)
        .send("입력하신 정보와 일치하는 사용자를 찾을 수 없습니다.");
    } else {
      return res
        .status(200)
        .send(`찾으시는 이메일은 ${results[0].email} 입니다.`);
    }
  });
});

router.post("/findpwd", (req, res) => {
  const { name, email, question, answer } = req.body;

  // 입력 데이터 확인
  if (!name || !email || !question || !answer) {
    return res.status(400).send("모든 필드를 입력해주세요.");
  }

  connection.query(
    "SELECT * FROM user WHERE name = ? AND email = ? AND question = ? AND answer = ?",
    [name, email, question, answer],
    function (err, results) {
      if (err) {
        console.error(err);
        return res.status(500).send("비밀번호 찾기 중 오류가 발생했습니다.");
      }

      if (results.length === 0) {
        return res
          .status(401)
          .send("입력하신 정보와 일치하는 사용자를 찾을 수 없습니다.");
      }

      // 해당 정보와 일치하는 사용자가 있을 경우, changepwd 페이지로 이동
      res.status(200).send("GET /user/changepwd");

    }
  );
});

router.post("/changepwd", (req, res) => {
  const { email, newPwd } = req.body;

  // 입력된 새 비밀번호가 없는 경우 에러 메시지를 반환합니다.
  if (!newPwd || !email) {
    return res.status(400).send("모든 필드를 입력해주세요.");
  }

  // 기존 비밀번호를 데이터베이스에서 가져옵니다.
  connection.query(
    "SELECT pwd FROM user WHERE email = ?",
    [email],
    function (err, results) {
      if (err) {
        console.error(err);
        return res.status(500).send("비밀번호 변경 중 오류가 발생했습니다.");
      }

      if (results.length === 0) {
        return res.status(401).send("해당 이메일의 사용자를 찾을 수 없습니다.");
      }

      // 가져온 기존 비밀번호를 암호화된 형태로 저장합니다.
      const oldPwd = results[0].pwd;

      // bcrypt.compare를 이용해 새 비밀번호와 기존 비밀번호를 비교합니다.
      bcrypt.compare(newPwd, oldPwd, function (err, isMatch) {
        if (err) {
          console.error(err);
          return res.status(500).send("비밀번호 비교 중 오류가 발생했습니다.");
        }

        // 만약 새 비밀번호와 기존 비밀번호가 같다면 에러 메시지를 반환합니다.
        if (isMatch) {
          return res
            .status(400)
            .send(
              "새 비밀번호가 기존 비밀번호와 동일합니다. 다시 입력해주세요."
            );
        }

        // 새 비밀번호를 암호화합니다.
        bcrypt.hash(newPwd, 10, (err, hashedPwd) => {
          if (err) {
            console.error(err);
            return res
              .status(500)
              .send("비밀번호 변경 중 오류가 발생했습니다.");
          }

          // 데이터베이스에 새 비밀번호를 저장합니다.
          connection.query(
            "UPDATE user SET pwd = ? WHERE email = ?",
            [hashedPwd, email],
            (err, result) => {
              if (err) {
                console.error(err);
                return res
                  .status(500)
                  .send("비밀번호 변경 중 오류가 발생했습니다.");
              } else {
                res.status(200).send("비밀번호 변경 성공!");
              }
            }
          );
        });
      });
    }
  );
});

module.exports = router;
