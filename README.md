# FF3-OFX

This is a React application that can be used to import transactions using your financial institution's OFX (Money format) exports.  The application runs on client side only and stores the FF3 token (for authentication) in localStorage on your browser. Since it is a client side only application, It expects to be served from the same domain as your FireFlyIII (FF3) instance.  See `Deployment` below for more information.

The project has been updated to allow editing the imported transactions.  This was also done for personal reasons since FF3's own editing is always a click to navigate to the transaction page and going back which means you lose context.

## Note on AI Use
I am using Claude code to assist in coding the project now.  The UI redesign was based on a mockup that Claude provided for example and all the tests have been added by claude.  Feel free to review the code and provide feedback if you see any issues.

## What's next
I'd like to allow editing all transactions in this tool to avoid the navigation back and forth in FF3.
Possibly adding quick filters to filter down to account, transaction type, month, etc.

## How it works
The application attempts for fetch all of your accounts on startup.  If that fails, you are prompted to enter in your FF3 Personal Access Token (PAT) after which point the accounts are re-fetched and the application is ready to accept a new OFX file.

Once an OFX file is dropped in the drop zone, it is read (in your browser) and the transactions parsed.  If a matching account was found in FF3, then the import starts by processing each transaction.  If an matching account is not found, you will be prompted to create a new account.

For each transaction:
1. A list of matching transaction from the corresponding account is fetched for 3 days before to 3 days after the transaction date (no filtering, just all transactions between the two dates).
2. Each transaction is first checked to see the FF3 external_id matches the financial institution's transactionId.
   1. If a match is found, this is considered an exact match and the transaction is not imported.
3. Next, the amount of the transaction is compared to the list of matching transactions.
   1. If a match is found, a secondary check is performed to see if both transactions are of the same type (withdraw, deposit, etc).
   2. if the type also matches, then this is considered an amount match and the transaction is not imported but the user can override this using `Add Anyways`.
4. The last check is for split transactions to see if the amount matches a total for a split transaction.
   1. If a match is found, then this is considered an amount match and the transaction is not imported but the user can override this using `Add Anyways`.
5. If no matches are found at all, then the transaction is imported and the external_id is set to the financial institution's transactionId.
6. If a transaction is added using `Add Anyways`, then the external_id is once again set to the financial institution's transactionId.
7. As transactions are added, the FF3 account balance is updated and compared with the financial institution's balance.  Ideally, once things are done, these two matchup.

### Mismatched balance
If the account balances do not match after the import is complete, take the following actions:
1. Check to see if there are any transactions that were `amount matched` and not imported.\
   For example: If you have two PayPal charges for the same amount a couple of days apart, then most likely one of them would be matched by mistake and not imported automatically.  In this case, find the transaction, then click the down arrow to expand the matching transactions and review them.  Most likely the match was a mistake and you can import the transaction by clicking `Add Anyways`. 
2. For Credit Cards, also check to see if there are other transactions that you may not have imported yet.\
   For example: My bank only allows me to export my transactions based on my statement date which is the 12th of the month.  So if I am importing transactions on the 17th, I have to import that last statement and then also import the current one which will keep getting updated until the 12th of the next month.

If neither of the above help, then do your investigation and create an issue.  **Issues will be addressed as time allows.**

### Post import
It is now possible to edit the transaction post import in FF3-OFX.  If the transaction imported matched an automation rule, then the
category and tags would be displayed.

#### To Edit a transaction
1. Click the edit button.
2. Update the transaction as necessary.
3. Click the save button.

Notes:
- To cancel the edit, you can click `Cancel` or the `Editing` button.
- Edited transaction show an `Edited` tag.
- If a withdraw is converted into a transfer, then the source account cannot be changed.
- If a deposit is converted into a transfer, then the destination account cannot be changed.

## Development
This project was bootstrapped with [Vite](https://vite.dev/).  Also see: [https://hello-sunil.in/vite-setup-with-yarn/](https://hello-sunil.in/vite-setup-with-yarn/)

In order to start the app in development mode, create a .env.local file in the main folder (same level as package.json), and enter the following content:

```
VITE_PROXY = "https://<your FF3 FQDN>"
```

Note: The .env.local file is in .gitignore so it will not be checked into the repository.

## Available Scripts

In the project directory, you can run:

### `yarn install`

Installs the necessary node modules based on package.json.

### `yarn dev` <== to start in development mode

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser if not using HTTPS, otherwise go open [https://localhost:3000](https://localhost:3000).

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `yarn start` <== To start in production mode


### `yarn test` <== To run test and coverage
Launches the tests and coverage.


### `yarn compile`

Builds the app for production to the `dist` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `yarn dist`

Creates a new tar file with the artifacts in the `dist` folder.  It must be run after `yarn compile`.

Unpacking the tar file will create a ff3-ofx folder containing the application.

### `yarn package`

executes `yarn compile` and then `yarn dist`.

## Deployment / Installation

Once the application has been built (or **you can download the pre-compiled tar.gz file** for any release), it produces a tar file that can be uploaded to your FF3 server.  This app currently only works if it is served from the same domain as your FF3 server, so the steps below help you get it installed in a subdirectory so that it can be easily accessed.

Note: These instructions are for a docker installation but should hopefully be clear enough for other installation types to figure out what is needed.

1. Edit your [docker-compose](https://raw.githubusercontent.com/firefly-iii/docker/main/docker-compose.yml) file.
2. Under the volumes section add the following entry, to map ff3-ofx folder to /ofx on your FF3 server.
```
  volumes:
    ...
    - ./ff3-ofx:/var/www/html/public/ofx
```
3. Unpack the tar in the same folder as your docker-compose file.  This will produce the ff3-ofx folder and put all the build files under it.
4. Make sure file permissions are good.  `chmod 755` should be good enough to browse the folders and read the files.
5. Restart your FF3 server: `docker compose down; docker compose up -d`\
   **Note:** Anytime you deploy a new version of ff3-ofx, you need to restart your FF3 instance to make sure it serves the new files
6. Login to your FF3 application.
7. CLick on Options -> Profile -> OAuth.
8. Create a new PAT and call it ff3-ofx.  Make sure to keep the token in a safe place in case you need it again later (and you will at some point).
9.  Browse to the application: `https://<your FF3 domain>/ofx` and you should be prompted to input a token.  
10. (Optional) You can bookmark or add this URL to whatever dashboard you are using for future use.
11. Enter you PAT into the text box and hit the login button.\
    Note: If you do not want to enter your PAT each time, make sure to check `Store token for next time` before clicking the `Login` button.
12. You should be ready to drop an OFX file and get importing.
