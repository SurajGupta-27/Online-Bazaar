// Merges categories into another one: moves their products across, then
// deletes the emptied categories.
//
//   npm run merge:categories -- --into Watches --from "Mens Watches" --from "Womens Watches"
//                                          dry run: lists what would move
//   add --apply to merge
//
// Category names match exactly, ignoring case. Safe to re-run: a category is
// only deleted once no product points at it.
import productModel from "../models/productModel.js";
import categoryModel from "../models/categoryModel.js";
import { escapeRegex } from "../helpers/escapeRegex.js";
import { APPLY, args, connect, run } from "./scriptUtils.mjs";

const valuesOf = (flag) => args.flatMap((arg, i) => (args[i - 1] === flag ? [arg] : []));
const [intoName] = valuesOf("--into");
const fromNames = valuesOf("--from");

const findCategory = (name) =>
  categoryModel.findOne({ name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } });

run(async () => {
  if (!intoName || !fromNames.length) {
    throw new Error('Usage: --into "Watches" --from "Mens Watches" [--from ...]');
  }
  await connect();

  const into = await findCategory(intoName);
  if (!into) throw new Error(`No category named "${intoName}"`);
  const intoCount = await productModel.countDocuments({ category: into._id });
  console.log(`Into "${into.name}" (${into._id}), which has ${intoCount} product(s)`);

  let moved = 0;
  let merged = 0;
  for (const name of fromNames) {
    const from = await findCategory(name);
    if (!from) {
      console.log(`  no category named "${name}"`);
      continue;
    }
    if (String(from._id) === String(into._id)) {
      console.log(`  skip "${from.name}": it is the target`);
      continue;
    }
    const products = await productModel.find({ category: from._id }).select("name");
    console.log(`  ${APPLY ? "moved" : "would move"} ${products.length} product(s) from "${from.name}" (${from._id}):`);
    for (const product of products) console.log(`    ${product.name}`);
    if (APPLY) {
      await productModel.updateMany({ category: from._id }, { $set: { category: into._id } });
      if (await productModel.exists({ category: from._id })) {
        console.log(`  keep category "${from.name}": products were added during the merge; re-run`);
        moved += products.length;
        continue;
      }
      await categoryModel.deleteOne({ _id: from._id });
    }
    console.log(`  ${APPLY ? "deleted" : "would delete"} category "${from.name}"`);
    moved += products.length;
    merged++;
  }

  console.log(
    `\n${APPLY ? "Moved" : "Would move"} ${moved} product(s) into "${into.name}" (${intoCount + moved} in total), ${APPLY ? "deleted" : "would delete"} ${merged} categor${merged === 1 ? "y" : "ies"}.`
  );
});
