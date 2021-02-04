const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const refreshToken = require("../utils/refreshToken");
const { validateStudent } = require("../middleWares/validation");
const logger = require("../utils/logger");

module.exports = {
  //Login USERS
  login: async (req, res) => {
    //Acquiring email and passwords from body
    const email = req.body.email;
    const password = req.body.password;
    const ip = req.header("x-forwarded-for") || req.connection.remoteAddress;

    //INPUT DATA VALIDATION
    const validation = validateStudent(req);
    if (validation.error) {
      console.log('Invalid credentials',validation.error.details[0].message)
      return res
        .status(400)
        .send({ status: false, message: validation.error.details[0].message });
    }

    //SQL Query
    db.query(
      `SELECT * FROM ALL_USER WHERE Email = ? `,
      [email],
      async function (err, results) {
        if (err) {
          console.log(err);
          res.send({
            status: false,
            message: "Something went wrong",
          });
        } else {
          let status = true,
            message;
          //USER is found
          if (results.length > 0) {
            const isEqual = await bcrypt.compare(password, results[0].Password);
            if (!isEqual) {
              //Incorrect Password
              console.log("Incorrect Password");
              status = false;
              message = "Incorrect Password";
            }

            let token;

            //If token is not there then providing a new token
            if (results[0].Token == null) {
              token = jwt.sign(
                {
                  Email: results[0].Email,
                },
                process.env.TOKEN_SECRET,
                { expiresIn: "1h" }
              );
            }

            //If token is already there then checking for its expiry
            //If expired providing him/ her new token
            //Else returing the same token
            else {
              token = refreshToken(results[0].Token, results[0].Email);
            }

            console.log(token);

            //Saving the token in database
            db.query(
              `UPDATE ALL_USER SET Token = ? WHERE Email = ?`,
              [token, email],
              function (err, results) {
                if (err) {
                  console.log(err);
                  status = false;
                  message = "Something went wrong";
                } else {
                  console.log(results);
                }
              }
            );

            if (status) {
              logger("user logged in", email, ip);
              res.send({
                status,
                token,
                email: results[0].Email,
              });
            } else {
              res.send({
                status,
                message,
              });
            }
          } else {
            console.log("Student not found");
            res.status(400).send({
              status: false,
              message: "Student not found",
            });
          }
        }
      }
    );
  },

  // Register USERS
  register: async (req, res) => {
    //Requiring email and password from body
    const email = req.body.email;
    const password = req.body.password;
    const ip = req.header("x-forwarded-for") || req.connection.remoteAddress;

    //INPUT DATA VALIDATION
    const validation = validateStudent(req);
    if (validation.error) {
      console.log('invalid credentials',validation.error.details[0].message)
      return res
        .status(400)
        .send({ status: false, message: validation.error.details[0].message });
    }

    //Hashing the password
    const hashedPassword = await bcrypt.hash(password, 12);

    //SQL query
    db.query(
      `INSERT INTO ALL_USER (Email, Password) VALUES(?,?)`,
      [email, hashedPassword],
      function (err, results) {
        //Registration failed
        if (err) {
          console.log(err);
          res.send({
            status: false,
            message: err.sqlMessage,
          });
        }
        //Registration success
        else {
          console.log(results);
          //log to db
          logger("new user registered", email, ip);
          res.send({
            status: true,
            message: "Successfully registered",
          });
        }
      }
    );
  },

  //Logout USERS
  logout: async (req, res) => {
    //Acquiring token from header
    const authHeader = req.get("Authorization");
    const ip = req.header("x-forwarded-for") || req.connection.remoteAddress;

    //checking if token exists in header
    if (!authHeader) return res.status(400).send({ message: "can't logout" });
    console.log(authHeader);

    //checking if token is expired or altered
    let decodedToken;
    try {
      decodedToken = await jwt.verify(authHeader, process.env.TOKEN_SECRET);
    } catch (error) {
      if (error) return res.status(400).send({ message: "can't logout" });
    }

    const email = decodedToken.Email;

    //check if user is already logged out
    //SQL Query
    db.query(
      `SELECT Token FROM ALL_USER WHERE Email = ? `,
      [email],
      async function (err, results) {
        console.log(results);
        if (err) {
          console.log(err);
          res.status(500).send({
            status: false,
            message: "Something went wrong",
          });
        } else {
          if (results[0].Token == null) {
            return res.status(400).send({ message: "can't logout" });
          }
          //user is logged in and token verified
          // Deleting the jwt token from database
          db.query(
            `UPDATE ALL_USER SET Token = NULL WHERE Email = ?`,
            [email],
            function (err, results) {
              if (err) {
                console.log("logout unsuccessful", err.sqlMessage);
                res.send({
                  status: false,
                  message: err.sqlMessage,
                });
              } else {
                console.log("logged you out");
                logger("user logged out", email, ip);
                res.send({
                  status: true,
                  message: "Successfully logged you out",
                });
              }
            }
          );
        }
      }
    )
  },
}