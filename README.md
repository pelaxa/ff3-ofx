# FF3-OFX

This is a React application that can be used to import transactions using your financial institution's OFX (Money format) exports.  The application runs on client side only and stores the FF3 token (for authentication) in localStorage on your browser. Since it is a client side only application, It expects to be served from the same domain as your FireFlyIII (FF3) instance.  See `Deployment` below for more information.

This is just a quick side project I revamped a little so that others may use it as well, but there are no real maintenance plans as of yet and it has only been tested for my personal use case so far so there may be bugs for certain situations.

## How it works
The application attempts for fetch all of your accounts on startup.  If that fails, you are prompted to enter in your FF3 Personal Access Token (PAT) after which point the accounts are refetched and the application is ready to accept a new OFX file.

Once an OFX file is dropped in the drop zone, it is read (in your browser) and the transactions parsed.  If a matching account was found in FF3, then the import starts by processing each transaction.

For each transaction:\
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


## Development
This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

In order to start the app in development mode, create a secrets.json file in the main folder (same level as setupProxy.js), and enter the following content:

```
{
    "proxyUrl": "https://<your FF3 FQDN>"
}
```
Since the above is using https, it is necessary to use the HTTPs startup script below.

Note: The secrets.json file is in .gitignore so it will not be checked into the repository.

## Available Scripts

In the project directory, you can run:

### `yarn install`

Installs the necessary node modules based on package.json.

### `yarn start` <== To start without HTTPS
### `HTTPS=true yarn start` <== to start with HTTPS

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser if not using HTTPS, otherwise go open [https://localhost:3000](https://localhost:3000).

The page will reload when you make changes.\
You may also see any lint errors in the console.

<!-- ### `yarn test` <== TODO

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information. -->


### `yarn compile`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `yarn dist`

Creates a new zip file with the artifacts in the `build` folder.\
It must be run after `yarn compile`.

Unpacking the zip file will create a ff3-ofx folder containing the application.

### `yarn package`

executes `yarn compile` and then `yarn dist`.

### `yarn eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

<!-- ## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration) -->

## Deployment

Once the application has been built, it produces a zip file that can be uploaded to your FF3 server.  This app currently only works if it is served from the same domain as your FF3 server, so the steps below help you get it installed in a subdirectory so that it can be easily accessed.

Note: These instructions are for a docker installation but should hopefully be clear enough for other installation types to figure out what is needed.

1. Edit your [docker-compose](https://raw.githubusercontent.com/firefly-iii/docker/main/docker-compose.yml) file.
2. Under the volumes section add the following entry, to map ff3-ofx folder to /ofx on your FF3 server.
   ```
    volumes:
      ...
      - ./ff3-ofx:/var/www/html/public/ofx
   ```
3. Unzip the build zip in the same folder as your docker-compose file.  This will produce the ff3-ofx folder and put all the build files under it.
4. Make sure file permissions are good.  `chmod 755` should be good enough to browse the folders and read the files.
5. Restart your FF3 server: `docker compose down; docker compose up -d`\
   **Note:** Anytime you deploy a new version of ff3-ofx, you need to restart your FF3 instance to make sure it serves the new files
6. Login to your FF3 application.
7. CLick on Options -> Profile -> OAuth.
8. Create a new PAT and call it ff3-ofx.  Make sure to keep the token in a safe place in case you need it again later (and you will at some point).
9.  Browse to the application: `https://<your FF3 domain>/ofx` and you should be prompted to input a token.  
10. (Optional) You can bookmark or add this URL to whatever dashboard you are using for future use.
11. Enter you PAT into the text box and hit the tab key.\
    Note: If you do not want to enter your PAT each time, make sure to check `Store token for next time`.
12. You should be ready to drop an OFX file and get importing.



### `yarn build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
