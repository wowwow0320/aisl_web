const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const path = require("path");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const { hashPassword } = require("mysql/lib/protocol/Auth");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const cookieParser = require('cookie-parser');
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
router.use(cookieParser());

router.use(passport.initialize());
// 세션 사용 설정
router.use(passport.session());

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(200);
}
function checkMaster(req, res, next) {
  const isMaster = req.user.master;

  if(isMaster == 1){
    return next();
  }
  return res.res.status(200);
}

// 로그인이 되어 있는 상태에서 로그인 또는 회원 가입 페이지에 접근하는 경우 사용
function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.status(200);
  }
  return next();
}


router.get("/", (req, res) =>{
  const query1 = "SELECT plan.contents, date FROM plan";
  const query2 = `
    SELECT post.postid, user.name AS writer, post.contents,
           IFNULL(likes.likeid, 0) AS likeid, likes.liker, user.name AS liker
    FROM post
           LEFT JOIN user ON post.writer = user.userid
           LEFT JOIN likes ON post.postid = likes.postid
  `;


  connection.query(query1, (err, planResults) => {
    if (err) {
      console.error(err);
      res.status(500);
    } else {
      connection.query(query2, (err, postResults) => {
        if (err) {
          console.error(err);
          res.status(500);
        } else {
            const plan = planResults;
            console.log("community 조회 성공");

            // community 결과 처리 로직...

            const post = postResults;
            console.log("post 조회 성공");

            // plan 결과 처리 로직...
            const mergedData = postResults.reduce((acc, row) => {
              const {postid, writer, contents, likeid, createdAt, liker } = row;

              if (!acc.posts.hasOwnProperty(postid)) {
                acc.posts[postid] = {
                  postid,
                  writer,
                  contents,
                  // CreatedAt, // 작성일자를 가져와서 할당해야 함
                  createdAt, // 작성일자를 가져와서 할당해야 함
                  likers: [], // 초기값을 빈 배열로 설정
                };
              }

              if (likeid !== 0) {
                acc.posts[postid].likers.push({
                  likeid,
                  postid,
                  liker,
                  //CreatedAt, // 작성일자를 가져와서 할당해야 함
                  createdAt, // 좋아요 작성일자를 가져와서 할당해야 함
                });
              }
              return acc;
            }, {posts: {}});
            const uniqueData = Object.values(mergedData.posts);

            res.status(200).json({plan, post: uniqueData});
        }
      });
    }
  });

});

router.post("/likes", (req, res)=>{
  const postid = req.body.postid;
  const liker = req.user.userid;

  //const query1 = "SELECT likeid FROM likes WHERE planid = ? AND liker = ?";
  //const query2 = "INSERT INTO likes (postid, liker) VALUES (?, ?)";
  connection.query("SELECT * FROM likes WHERE postid = ? AND liker = ?",
      [postid, liker],
      function (err, results) {
        console.log(results);
        if (err) {
          console.error(err);
          res.status(500);
        }
        else{
          if (results && results.length > 0) {
            connection.query(
                "DELETE FROM likes WHERE postid = ? AND liker = ?",
                [postid, liker],
                function (err, deleteResults) {
                  if (err) {
                    console.error(err);
                    res.status(500);
                  } else {
                    if (deleteResults && deleteResults.affectedRows > 0) {
                      console.log("like 삭제 성공"); // 로그로 출력
                      res.status(204);
                    } else {
                      res.status(403);
                    }
                  }
                }
            );
          }
          else{
            connection.query(
                "INSERT INTO likes (postid, liker) VALUES (?, ?)",
                [postid, liker],
                function (err, results) {
                  if (err) {
                    console.error(err);
                    res.status(500);
                  } else {
                    if(results && results.affectedRows > 0){
                      res.status(201);
                    }
                    else{
                      res.status(403);
                    }
                  }
                }
            );
          }
        }
      });
});

router.post("/createpost", (req, res) => {
  const { contents } = req.body;
  const writer = req.user.userid;
  console.log(writer);

  if (!contents) {
    return res.status(400);
  }
  const query = "INSERT INTO post (writer, contents) VALUES (?, ?)";
  connection.query(query, [writer, contents], (err, results) => {
    console.log(results);
    if (err) {
      console.error(err);
      res.status(500);
    } else {
      if (results && results.affectedRows > 0) {
        res.status(201);
      } else {
        res.status(403);
      }
    }
  });
});

// 게시물 수정 처리
router.post("/updatepost", (req, res) => {
  const postid = req.body.postid; // 게시물의 고유 식별자(ID)
  const writer = req.user.userid; // 현재 로그인한 사용자의 ID
  const contents = req.body.contents; // 수정하고자 하는 내용

  if (!contents) {
    return res.status(400).send("모든 필드를 입력해주세요.");
  }

  // 게시물 업데이트 SQL 쿼리 실행
  const query = "UPDATE post SET contents = ? WHERE postid = ? AND writer = ?";
  connection.query(query, [contents, postid, writer], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500);
    } else {
      if (results && results.affectedRows > 0) {
        res.status(200);
      } else {
        res.status(403);
      }
    }
  });
});

router.post("/deletepost", (req, res) => {
  const postid = req.body.postid; // 게시물의 고유 식별자(ID)
  const writer = req.user.userid; // 현재 로그인한 사용자의 ID

  // 게시물 삭제 SQL 쿼리 실행
  const query = "DELETE FROM post WHERE postid = ? AND writer = ?";
  connection.query(query, [postid, writer], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500);
    } else {
      if (results && results.affectedRows > 0) {
        res.status(204);
      } else {
        res.status(403);
      }
    }
  });
});

router.post("/createplan", (req, res) => {
  const { date, contents } = req.body;
  const writer = req.user.userid;

  if (!date || !contents) {
    return res.status(400);
  }
  const query = "INSERT INTO plan (writer, date, contents) VALUES (?, ?, ?)";
  connection.query(query, [writer, date, contents], (err, results) => {
    console.log(results);
    if (err) {
      console.error(err);
      res.status(500);
    } else {
      if (results && results.affectedRows > 0) {
        res.status(201);
      } else {
        res.status(403);
      }
    }
  });
});

// plan 수정 처리
router.post("/updateplan", (req, res) => {
  //const planid = req.body.planid; // 게시물의 고유 식별자(ID)
  const writer = req.user.userid; // 현재 로그인한 사용자의 ID
  const { planid, date, contents } = req.body; // 수정하고자 하는 내용

  if (!date || !contents) {
    return res.status(400);
  }

  // plan 업데이트 SQL 쿼리 실행
  const query =
    "UPDATE plan SET date = ?, contents = ? WHERE planid = ? AND writer = ?";
  connection.query(query, [date, contents, planid, writer], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500);
    } else {
      if (results && results.affectedRows > 0) {
        res.status(200);
      } else {
        res.status(403);
      }
    }
  });
});

router.post("/deleteplan", (req, res) => {
  const planid = req.body.planid; // 게시물의 고유 식별자(ID)
  const writer = req.user.userid; // 현재 로그인한 사용자의 ID

  // 게시물 삭제 SQL 쿼리 실행
  const query = "DELETE FROM plan WHERE planid = ? AND writer = ?";
  connection.query(query, [planid, writer], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500);
    } else {
      if (results && results.affectedRows > 0) {
        res.status(204);
      } else {
        res.status(403);
      }
    }
  });
});

module.exports = router;
