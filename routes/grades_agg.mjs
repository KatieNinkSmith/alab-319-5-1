import express from "express";
import db from "./db/conn.mjs";

const router = express.Router();

/**
 * It is not best practice to separate these routes
 * like we have done here. This file was created
 * specifically for educational purposes, to contain
 * all aggregation routes in one place.
 */

/**
 * Grading Weights by Score Type:
 * - Exams: 50%
 * - Quizes: 30%
 * - Homework: 20%
 */

// Get the weighted average of a specified learner's grades, per class
router.get("/learner/:id/avg-class", async (req, res) => {
  let collection = await db.collection("grades");

  let result = await collection
    .aggregate([
      {
        $match: { learner_id: Number(req.params.id) },
      },
      {
        $unwind: { path: "$scores" },
      },
      {
        $group: {
          _id: "$class_id",
          quiz: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "quiz"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
          exam: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "exam"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
          homework: {
            $push: {
              $cond: {
                if: { $eq: ["$scores.type", "homework"] },
                then: "$scores.score",
                else: "$$REMOVE",
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          class_id: "$_id",
          avg: {
            $sum: [
              { $multiply: [{ $avg: "$exam" }, 0.5] },
              { $multiply: [{ $avg: "$quiz" }, 0.3] },
              { $multiply: [{ $avg: "$homework" }, 0.2] },
            ],
          },
        },
      },
    ])
    .toArray();

  if (!result) res.status(404).send("Not found");
  else res.status(200).send(result);
});

// Aggregate statistics for all learners
router.get("/stats", async (req, res) => {
  try {
    const result = await db
      .collection("students")
      .aggregate([
        {
          // Unwind the scores array to process each score individually
          $unwind: "$scores",
        },
        {
          // Extract the score type and value from the nested object structure
          $addFields: {
            scoreValue: {
              $arrayElemAt: [
                { $objectToArray: "$scores" }, // Convert nested object to key-value pairs
                0,
              ],
            },
          },
        },
        {
          // Extract "type" and "score" from the score object
          $addFields: {
            type: "$scoreValue.v.type",
            score: "$scoreValue.v.score",
          },
        },
        {
          // Add weights based on the type of the score
          $addFields: {
            weightedScore: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ["$type", "exam"] },
                    then: { $multiply: ["$score", 0.5] },
                  },
                  {
                    case: { $eq: ["$type", "quiz"] },
                    then: { $multiply: ["$score", 0.3] },
                  },
                  {
                    case: { $eq: ["$type", "homework"] },
                    then: { $multiply: ["$score", 0.2] },
                  },
                ],
                default: 0, // Default to 0 if type is unrecognized
              },
            },
          },
        },
        {
          // Group by student_id to calculate the total weighted score for each student
          $group: {
            _id: "$student_id",
            class_id: { $first: "$class_id" }, // Preserve class_id
            totalWeightedScore: { $sum: "$weightedScore" }, // Sum all weighted scores
          },
        },
        {
          // Rename the totalWeightedScore field to averageScore for clarity
          $project: {
            _id: 1,
            class_id: 1,
            averageScore: "$totalWeightedScore",
          },
        },
        {
          // Optionally, sort by averageScore in descending order
          $sort: { averageScore: -1 },
        },
      ])
      .toArray();

    res.json(result); // Return all students with their weighted averages
    res.status(200).send(stats[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Failed to calculate statistics" });
  }
});

export default router;
