import BlabMondayService from '../../services/blab-monday.service';


// export async function adjustmentSHL(req, res) {
//     try {
//         for (let h = 0; 20; h = h + 1) {
//             const array = [6409189141, 6409190203, 6409192628, 6409192947, 6409193277, 6409194131, 6409194872, 6409195706];
//             const columns = [
//                 { column_id: `numbers`, column_values: '' },
//             ];
//             for (let i = 0; i < array.length; i++) {
//                 const element = array[i];
//                 const items = await BlabMondayService.GetItemsPageByColumnValues(element, columns, ['numbers']);
//                 // const items = await BlabMondayService.getItemsIdOnly(element);
//                 if (items?.length) {
//                     for (let j = 0; j < items.length; j++) {
//                         const itemId: any = items[j];
//                         const text = itemId.column_values[0]?.text;
//                         console.log(`item: ${element} - ${i} - ${j}`);
//                         if (text !== -1) {
//                             await BlabMondayService.ChangeSimpleColumnValue(element, itemId.id, "numbers", -1);
//                         }
//                     }
//                 }
//             }
//         }
//     } catch (error) {
//         console.log(error);
//     }

//     return res.status(200).send('Done');
// }